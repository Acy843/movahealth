// Phase 2 provider: single hydration point + reset lifecycle actions.
// Firebase is source of truth; uid-scoped localStorage is cache only.
// Demo mode is isolated and never writes to Firebase user data.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { usePhase1Auth } from "@/lib/mova-auth";
import { clearAllMovaCache, initialState, loadCachedState, persistCachedState } from "@/lib/mova-cache";
import {
  completeOnboardingFlow,
  completeResetFlow,
  hydrateUserState,
  rescheduleResetFlow,
  saveCheckinFlow,
  saveProfileFlow,
  saveSettingsFlow,
  skipResetFlow,
  startResetFlow,
  verifyResetFlow,
  activateGracePeriodFlow,
  checkGraceStatus,
  getGraceRemainingMs,
} from "@/lib/mova-service";
import {
  createSavedPlace,
  loadPlacesForUser,
  savePlaceForUser,
} from "@/lib/location/place-service";
import {
  detectLocationContext,
  describeLocationContext,
  requestCurrentLocation,
  startWalkingTracking,
  type WalkingTrackerStats,
} from "@/lib/location/location-service";
import type { SavedPlace, SavedPlaceLabel, LocationContext, LocationPermissionStatus, LocationSnapshot, WalkingSession } from "@/lib/location/location-types";
import type {
  AuthenticatedMovaUser,
  CheckIn,
  MovaProfile,
  MovaSettings,
  MovaState,
  OnboardingDraft,
  Reset,
  UserDocument,
} from "@/lib/mova-types";
import {
  isDemoMode as isDemoModeFn,
  enterDemoMode,
  exitDemoMode,
  resetDemo as resetDemoState,
  setDemoContext,
  triggerNextDemoReset,
  startDemoReset,
  completeDemoReset,
  activateDemoGrace,
  dismissDemoReminder,
  verifyDemoReset,
  addDemoCheckin,
  setDemoWalkingSession,
  completeDemoWalking,
  demoAnalytics,
  demoBehavior,
  readDemoContext,
  type DemoContextApi,
} from "@/lib/mova-demo";

export type { AuthenticatedMovaUser, CheckIn, MovaProfile, MovaSettings, MovaState, OnboardingDraft, Reset, UserDocument };

export type SyncStatus = "idle" | "loading" | "ready" | "error";

type Ctx = {
  state: MovaState;
  user: AuthenticatedMovaUser | null;
  profile: MovaProfile | null;
  settings: MovaSettings | null;
  onboarded: boolean;
  resets: Reset[];
  checkIns: CheckIn[];
  nextReset: Reset | null;
  currentReset: Reset | null;
  backend: "local" | "firebase";
  syncStatus: SyncStatus;
  syncError: string | null;
  authReady: boolean;
  displayName: string;
  displayOccupation: string;
  currentLocationContext: LocationContext;
  currentLocation: LocationSnapshot | null;
  walkingSession: WalkingSession | null;
  walkingStats: WalkingTrackerStats | null;
  locationPermissionStatus: LocationPermissionStatus;
  savedPlaces: SavedPlace[];
  locationError: string | null;
  locationEnabled: boolean;
  completeOnboarding: (draft: OnboardingDraft) => Promise<void>;
  savingOnboarding: boolean;
  onboardingError: string | null;
  setProfile: (patch: Partial<MovaProfile>) => void;
  dismissInsight: (insightId: string) => Promise<void>;
  startReset: (resetId: string) => Promise<void>;
  completeReset: (resetId: string) => Promise<void>;
  verifyReset: (resetId: string, verification: { status: "verified" | "failed"; method: "camera" | "manual" | "distance" | "timed"; message: string; confidence?: number; distanceMeters?: number }) => Promise<Reset | null>;
  rescheduleReset: (resetId: string, delayMinutes: number, reason: string) => Promise<void>;
  skipReset: (resetId: string) => Promise<void>;
  requestGrace: (resetId: string) => Promise<Reset | null>;
  saveCheckin: (resetId: string, feeling: string, needs: string[]) => Promise<void>;
  refreshLocation: () => Promise<void>;
  savePlace: (label: SavedPlaceLabel, latitude: number, longitude: number, radiusMeters?: number) => Promise<SavedPlace | null>;
  startWalkingSession: (resetId: string) => { stop: () => void } | null;
  stopWalkingSession: () => void;
  reset: () => void;
  demo: DemoContextApi;
  demoActive: boolean;
  demoReminders: import("@/lib/notifications/notification-types").Reminder[];
  enterDemoMode: () => void;
  exitDemoMode: () => void;
  resetDemo: () => void;
  setDemoContext: (context: LocationContext) => void;
  triggerNextDemoReset: () => { reminder: import("@/lib/notifications/notification-types").Reminder; reset: Reset | null };
  dismissDemoReminder: (reminderId: string) => void;
  verifyDemoReset: (resetId: string, method: "camera" | "manual" | "distance" | "timed", message: string, confidence?: number) => Reset | null;
  addDemoCheckin: (resetId: string, feeling: string, needs: string[]) => void;
  setDemoWalkingSession: (session: WalkingSession | null) => void;
  demoAnalytics: () => ReturnType<typeof import("@/lib/analytics/analytics-engine").buildAnalyticsSummary>;
  demoBehavior: () => ReturnType<typeof import("@/lib/intelligence/behavior-engine").buildBehaviorSummary>;
};

const MovaContext = createContext<Ctx | null>(null);

export function MovaProvider({ children }: { children: ReactNode }) {
  const auth = usePhase1Auth();
  const [state, setState] = useState<MovaState>(() => initialState());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<LocationSnapshot | null>(null);
  const [currentLocationContext, setCurrentLocationContext] = useState<LocationContext>("unknown");
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<LocationPermissionStatus>("unknown");
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationEnabled, setLocationEnabled] = useState<boolean>(state.settings?.locationEnabled ?? false);
  const [walkingSession, setWalkingSession] = useState<WalkingSession | null>(null);
  const [walkingStats, setWalkingStats] = useState<WalkingTrackerStats | null>(null);
  const [watchStopper, setWatchStopper] = useState<(() => void) | null>(null);

  // Demo mode state (isolated, never touches Firebase user data)
  const [demoReminders, setDemoReminders] = useState<import("@/lib/notifications/notification-types").Reminder[]>([]);
  const demoActive = isDemoModeFn();
  const demoContext = readDemoContext();

  // Activate demo mode if URL has ?demo param
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "1" || params.get("demo") === "true") {
      enterDemoMode();
      setDemoReminders([]);
    }
  }, []);

  const demo: DemoContextApi = {
    isDemoMode: isDemoModeFn,
    enterDemoMode,
    exitDemoMode,
    resetDemo: resetDemoState,
    setDemoContext,
    triggerNextDemoReset,
    startDemoReset,
    completeDemoReset,
    activateDemoGrace,
    dismissDemoReminder,
    verifyDemoReset,
    addDemoCheckin,
    setDemoWalkingSession,
    completeDemoWalking,
    demoAnalytics,
    demoBehavior,
    ensureDemoContext: () => {
      const ctx = readDemoContext();
      if (ctx.demo) return ctx;
      return enterDemoMode();
    },
    readDemoContext,
  };

  const enterDemoModeFn = useCallback(() => {
    enterDemoMode();
    setDemoReminders([]);
  }, []);

  const exitDemoModeFn = useCallback(() => {
    exitDemoMode();
    setDemoReminders([]);
  }, []);

  const resetDemoFn = useCallback(() => {
    resetDemoState();
    setDemoReminders([]);
  }, []);

  const setDemoContextFn = useCallback((context: LocationContext) => {
    setDemoContext(context);
  }, []);

  const triggerNextDemoResetFn = useCallback(() => {
    const result = triggerNextDemoReset();
    if (result.reminder) {
      setDemoReminders((prev) => [result.reminder, ...prev]);
    }
    return result;
  }, []);

  const dismissDemoReminderFn = useCallback((reminderId: string) => {
    dismissDemoReminder(reminderId);
    setDemoReminders((prev) => prev.filter((r) => r.id !== reminderId));
  }, []);

  const verifyDemoResetFn = useCallback((resetId: string, method: "camera" | "manual" | "distance" | "timed", message: string, confidence?: number) => {
    return verifyDemoReset(resetId, method, message, confidence);
  }, []);

  const addDemoCheckinFn = useCallback((resetId: string, feeling: string, needs: string[]) => {
    addDemoCheckin(resetId, feeling, needs);
  }, []);

  const setDemoWalkingSessionFn = useCallback((session: WalkingSession | null) => {
    setDemoWalkingSession(session);
  }, []);

  useEffect(() => { if (typeof window !== "undefined") setState(loadCachedState(null)); }, []);

  useEffect(() => {
    if (auth.status === "loading") {
      setSyncStatus("loading");
      return;
    }
    if (auth.status === "disabled" || auth.status === "error") {
      setSyncStatus(auth.status === "error" ? "error" : "idle");
      if (auth.status === "error") setSyncError(auth.error);
      setState(loadCachedState(null));
      return;
    }
    if (auth.status === "ready" && auth.user) {
      const u = auth.user;
      setSyncStatus("loading");
      const cached = loadCachedState(u.uid);
      if (cached.profile || cached.userDoc || cached.resets.length > 0) {
        setState((prev) => ({ ...prev, user: u, userDoc: cached.userDoc, profile: cached.profile, settings: cached.settings, resets: cached.resets, checkIns: cached.checkIns, onboarded: cached.onboarded }));
      } else {
        setState((prev) => ({ ...prev, user: u }));
      }
      hydrateUserState(u)
        .then((h) => {
          setState((prev) => ({ ...prev, user: u, userDoc: h.userDoc, profile: h.profile, settings: h.settings, resets: h.resets, checkIns: h.checkIns, onboarded: h.onboarded, dailyScheduleDate: h.dailyScheduleDate }));
          setSyncStatus("ready");
          setSyncError(null);
        })
        .catch((e: unknown) => {
          setSyncStatus("error");
          setSyncError(e instanceof Error ? e.message : "load_failed");
        });
    }
  }, [auth.status, auth.user, auth.error]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    persistCachedState(state.user?.uid ?? null, state);
  }, [state]);

  useEffect(() => {
    setLocationEnabled(state.settings?.locationEnabled ?? false);
  }, [state.settings]);

  useEffect(() => {
    void (async () => {
      const uid = auth.user?.uid ?? null;
      const places = await loadPlacesForUser(uid);
      setSavedPlaces(places);
    })();
  }, [auth.user?.uid]);

  const refreshLocation = useCallback(async () => {
    if (!locationEnabled || typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLocationPermissionStatus("unavailable");
      setCurrentLocationContext("unknown");
      setLocationError("Location is unavailable on this device.");
      return;
    }
    const result = await requestCurrentLocation();
    setLocationPermissionStatus(result.status);
    if (result.snapshot) {
      setCurrentLocation(result.snapshot);
      const nextContext = detectLocationContext(result.snapshot, savedPlaces);
      setCurrentLocationContext(nextContext);
      setLocationError(null);
    } else {
      setCurrentLocation(null);
      setCurrentLocationContext("unknown");
      setLocationError(result.message ?? "Location unavailable.");
    }
  }, [locationEnabled, savedPlaces]);

  const savePlace = useCallback(async (label: SavedPlaceLabel, latitude: number, longitude: number, radiusMeters = 250) => {
    const place = createSavedPlace(label, latitude, longitude, radiusMeters, new Date().toISOString());
    const saved = await savePlaceForUser(auth.user?.uid ?? null, place);
    setSavedPlaces((prev) => {
      const without = prev.filter((p) => p.label !== label);
      return [...without, saved];
    });
    if (currentLocation) {
      const nextContext = detectLocationContext(currentLocation, [saved]);
      setCurrentLocationContext(nextContext);
    }
    return saved;
  }, [auth.user?.uid, currentLocation]);

  const stopWalkingSession = useCallback(() => {
    setWatchStopper((stop) => {
      stop?.();
      return null;
    });
    setWalkingSession((prev) => (prev ? { ...prev, status: "completed", endedAt: new Date().toISOString() } : prev));
  }, []);

  const startWalkingSession = useCallback((resetId: string) => {
    // Walking verification uses the REAL browser geolocation stack. The
    // locationEnabled settings toggle governs passive background location
    // context only — it must never silently block a required verification.
    // Browser permission is the actual consent mechanism (watchPosition prompts).
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLocationError("This device has no GPS support.");
      return null;
    }
    // A new session always starts from zero — never from historical distance.
    setWalkingSession({
      id: `${resetId}-walk-${Date.now()}`,
      resetId,
      startedAt: new Date().toISOString(),
      endedAt: null,
      distanceMeters: 0,
      distanceMiles: 0,
      status: "active",
    });
    const tracker = startWalkingTracking(
      (snapshot, totalMeters, stats) => {
        setCurrentLocation(snapshot);
        setCurrentLocationContext(detectLocationContext(snapshot, savedPlaces));
        setLocationError(null);
        setLocationPermissionStatus("granted");
        setWalkingStats(stats);
        setWalkingSession((prev) => ({
          id: prev?.id ?? `${resetId}-walk-${Date.now()}`,
          resetId,
          startedAt: prev?.startedAt ?? new Date().toISOString(),
          endedAt: null,
          distanceMeters: totalMeters,
          distanceMiles: totalMeters / 1609.344,
          status: "active",
        }));
      },
      (message) => {
        setLocationError(message);
        setLocationPermissionStatus("denied");
      },
    );
    setWatchStopper(() => tracker.stop);
    return { stop: () => tracker.stop() };
  }, [savedPlaces]);

  useEffect(() => {
    if (!locationEnabled) {
      setCurrentLocationContext("unknown");
      setLocationError(null);
    }
  }, [locationEnabled]);

  useEffect(() => {
    if (savedPlaces.length > 0 && currentLocation) {
      setCurrentLocationContext(detectLocationContext(currentLocation, savedPlaces));
    }
  }, [savedPlaces, currentLocation]);

  const completeOnboarding = useCallback(
    async (draft: OnboardingDraft) => {
      setSaving(true);
      setSaveError(null);
      try {
        const done = await completeOnboardingFlow(auth.user, draft);
        setState((prev) => ({ ...prev, userDoc: done.userDoc, profile: done.profile, settings: done.settings, resets: done.resets, checkIns: done.checkIns, onboarded: true, dailyScheduleDate: done.dailyScheduleDate }));
      } catch (e: unknown) {
        setSaveError(e instanceof Error ? e.message : "save_failed");
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [auth.user],
  );

  const setProfile = useCallback(
    (patch: Partial<MovaProfile>) => {
      setState((prev) => {
        if (!prev.profile) return prev;
        const next = { ...prev.profile, ...patch };
        void saveProfileFlow(auth.user, next);
        return { ...prev, profile: next };
      });
    },
    [auth.user],
  );

  const dismissInsight = useCallback(async (insightId: string) => {
    setState((prev) => {
      const current = prev.settings;
      if (!current || current.suppressedInsightIds.includes(insightId)) return prev;
      const next = { ...current, suppressedInsightIds: [...current.suppressedInsightIds, insightId] };
      void saveSettingsFlow(auth.user, next);
      return { ...prev, settings: next };
    });
  }, [auth.user]);

  const applyReset = useCallback((updated: Reset) => {
    setState((prev) => ({ ...prev, resets: prev.resets.map((r) => (r.id === updated.id ? updated : r)) }));
  }, []);

  const findReset = useCallback((resetId: string) => state.resets.find((r) => r.id === resetId) ?? null, [state.resets]);

  const startReset = useCallback(async (resetId: string) => {
    const reset = findReset(resetId);
    if (!reset) { setSyncError("reset_not_found"); return; }
    const started = await startResetFlow(auth.user, resetId, currentLocationContext);
    if (started) applyReset(started); else setSyncError("reset_not_startable");
  }, [auth.user, applyReset, currentLocationContext, findReset]);

  const completeReset = useCallback(async (resetId: string) => {
    const reset = findReset(resetId);
    if (!reset) { setSyncError("reset_not_found"); return; }
    const completed = await completeResetFlow(auth.user, resetId);
    if (completed) applyReset(completed); else setSyncError("reset_not_completable");
  }, [auth.user, applyReset, findReset]);

  const rescheduleReset = useCallback(async (resetId: string, delayMinutes: number, reason: string) => {
    const reset = findReset(resetId);
    if (!reset) { setSyncError("reset_not_found"); return; }
    const out = await rescheduleResetFlow(auth.user, resetId, delayMinutes, reason);
    if (out.original && out.next) {
      const original = out.original as Reset;
      const next = out.next as Reset;
      setState((prev) => {
        const nextResets = prev.resets.filter((r) => r.id !== original.id);
        return { ...prev, resets: [next, ...nextResets] };
      });
    } else {
      setSyncError("reset_not_reschedulable");
    }
  }, [auth.user, findReset]);

  const skipReset = useCallback(async (resetId: string) => {
    const reset = findReset(resetId);
    if (!reset) { setSyncError("reset_not_found"); return; }
    const skipped = await skipResetFlow(auth.user, resetId);
    if (skipped) applyReset(skipped); else setSyncError("reset_not_skippable");
  }, [auth.user, applyReset, findReset]);

  // 10-minute grace period (persisted on the reset, not React state).
  const requestGrace = useCallback(async (resetId: string) => {
    const reset = findReset(resetId);
    if (!reset) { setSyncError("reset_not_found"); return null; }
    const granted = await activateGracePeriodFlow(auth.user, resetId, false);
    if (granted) applyReset(granted); else setSyncError("grace_unavailable");
    return granted;
  }, [auth.user, applyReset, findReset]);

  const verifyReset = useCallback(async (resetId: string, verification: { status: "verified" | "failed"; method: "camera" | "manual" | "distance" | "timed"; message: string; confidence?: number; distanceMeters?: number }) => {
    const reset = findReset(resetId);
    if (!reset) { setSyncError("reset_not_found"); return null; }
    const updated = await (await import("@/lib/mova-service")).verifyResetFlow(auth.user, resetId, verification);
    if (updated) applyReset(updated);
    return updated;
  }, [auth.user, applyReset, findReset]);

  const saveCheckin = useCallback(async (resetId: string, feeling: string, needs: string[]) => {
    const saved = await saveCheckinFlow(auth.user, { resetId, feeling, needs });
    setState((prev) => ({ ...prev, checkIns: [saved, ...prev.checkIns].slice(0, 200), lastFeeling: feeling, lastNeeds: needs }));
  }, [auth.user]);

  const reset = useCallback(() => {
    clearAllMovaCache();
    setState(initialState());
    setCurrentLocation(null);
    setCurrentLocationContext("unknown");
    setLocationPermissionStatus("unknown");
    setSavedPlaces([]);
    setLocationError(null);
    setWalkingSession(null);
    setWalkingStats(null);
    if (watchStopper) watchStopper();
  }, [watchStopper]);

  const value = useMemo<Ctx>(() => {
    const sorted = [...state.resets].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
    const current = sorted.find((r) => r.status === "active") ?? null;
    const next = sorted.find((r) => r.status === "scheduled") ?? null;
    return {
      state,
      user: state.user,
      profile: state.profile,
      settings: state.settings,
      onboarded: state.onboarded,
      resets: sorted,
      checkIns: state.checkIns,
      nextReset: next,
      currentReset: current,
      backend: state.user ? "firebase" : "local",
      syncStatus,
      syncError,
      authReady: auth.status === "ready" || auth.status === "disabled",
      displayName: state.userDoc?.displayName?.trim() || state.user?.displayName?.trim() || "Guest",
      displayOccupation: state.profile?.occupation || "",
      currentLocationContext,
      currentLocation,
      walkingSession,
      walkingStats,
      locationPermissionStatus,
      savedPlaces,
      locationError,
      locationEnabled,
      completeOnboarding,
      savingOnboarding: saving,
      onboardingError: saveError,
      setProfile,
      dismissInsight,
      startReset,
      completeReset,
      verifyReset,
      rescheduleReset,
      skipReset,
      requestGrace,
      saveCheckin,
      refreshLocation,
      savePlace,
      startWalkingSession,
      stopWalkingSession,
      reset,
      demo,
      demoActive,
      demoReminders,
      enterDemoMode: enterDemoModeFn,
      exitDemoMode: exitDemoModeFn,
      resetDemo: resetDemoFn,
      setDemoContext: setDemoContextFn,
      triggerNextDemoReset: triggerNextDemoResetFn,
      dismissDemoReminder: dismissDemoReminderFn,
      verifyDemoReset: verifyDemoResetFn,
      addDemoCheckin: addDemoCheckinFn,
      setDemoWalkingSession: setDemoWalkingSessionFn,
      demoAnalytics,
      demoBehavior,
    };
  }, [state, auth.status, syncStatus, syncError, completeOnboarding, saving, saveError, setProfile, dismissInsight, startReset, completeReset, rescheduleReset, skipReset, requestGrace, saveCheckin, currentLocationContext, currentLocation, walkingSession, locationPermissionStatus, savedPlaces, locationError, locationEnabled, refreshLocation, savePlace, startWalkingSession, stopWalkingSession, reset, demo, demoActive, demoReminders, enterDemoModeFn, exitDemoModeFn, resetDemoFn, setDemoContextFn, triggerNextDemoResetFn, dismissDemoReminderFn, verifyDemoResetFn, addDemoCheckinFn, setDemoWalkingSessionFn, demoAnalytics, demoBehavior]);

  return <MovaContext.Provider value={value}>{children}</MovaContext.Provider>;
}

export function useMova() {
  const ctx = useContext(MovaContext);
  if (!ctx) throw new Error("useMova must be used inside MovaProvider");
  return ctx;
}

export const locationContextLabel = (context: LocationContext) => describeLocationContext(context);
