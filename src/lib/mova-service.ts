// Phase 2 domain service: onboarding + hydration + reset lifecycle.
// All Firestore access goes through mova-repo; routes never touch Firestore.

import { activityById, getActivity } from "@/lib/mova-activities";
import { DEMO_FALLBACK_OCCUPATION, loadCachedState, persistCachedState } from "@/lib/mova-cache";
import {
  addCheckInDoc,
  ensureSettings,
  ensureUser,
  fetchRecentCheckIns,
  fetchSettings,
  fetchRecentResets,
  fetchResetsForDay,
  fetchProfile,
  fetchUser,
  getReset,
  putReset,
  saveProfile,
  saveSettings,
  saveUser,
  updateReset,
} from "@/lib/mova-repo";
import { buildDailySchedule } from "@/lib/mova-scheduler";
import type {
  AuthenticatedMovaUser,
  CheckIn,
  HydratedState,
  MovaProfile,
  MovaSettings,
  OnboardingDraft,
  Reset,
  UserDocument,
} from "@/lib/mova-types";
import { nowIso } from "@/lib/mova-types";

function fb(): string {
  return nowIso();
}

function isFirebaseUser(u: AuthenticatedMovaUser | null): u is AuthenticatedMovaUser {
  return !!u && !!u.uid;
}

function localProfileFromDraft(draft: OnboardingDraft): MovaProfile {
  return {
    occupation: draft.occupation,
    workStyle: draft.workStyle,
    constraints: draft.constraints,
    breakRhythm: draft.breakRhythm,
    goals: [],
    movementPreference: null,
    preferredActivityTypes: [],
    typicalLocations: [],
    updatedAt: nowIso(),
  };
}

function sortResets(list: Reset[]): Reset[] {
  return [...list].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
}

function validateOnboardingDraft(draft: OnboardingDraft): string {
  const occupation = draft.occupation === "Other" ? draft.customOccupation?.trim() : draft.occupation.trim();
  if (!occupation) return "occupation_required";
  if (draft.workStyle.length === 0) return "work_style_required";
  if (draft.constraints.length === 0) return "constraints_required";
  if (!draft.breakRhythm.trim()) return "break_rhythm_required";
  if (!draft.displayName?.trim()) return "display_name_required";
  return "";
}

// ── hydration ────────────────────────────────────────────────────────────

export async function hydrateUserState(u: AuthenticatedMovaUser): Promise<HydratedState> {
  const stamp = fb();
  const [userDoc, profile, settings] = await Promise.all([
    fetchUser(u.uid, stamp),
    fetchProfile(u.uid, stamp),
    fetchSettings(u.uid, stamp),
  ]);
  const [resets, checkIns] = await Promise.all([
    fetchRecentResets(u.uid, stamp),
    fetchRecentCheckIns(u.uid, stamp).catch(() => [] as CheckIn[]),
  ]);
  const today = new Date();
  const dayIso = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  let finalResets = resets;
  let scheduleDate: string | null = resets.some((r) => r.scheduledFor.slice(0, 10) === dayIso.slice(0, 10)) ? dayIso : null;

  // Idempotent top-up: if user is onboarded but today has no schedule, create it.
  if (userDoc?.onboardingCompleted) {
    const existing = await fetchResetsForDay(u.uid, dayIso, stamp).catch(() => [] as Reset[]);
    if (existing.length === 0) {
      const plan = buildDailySchedule(profile ?? localProfileFromDraft({ occupation: DEMO_FALLBACK_OCCUPATION, workStyle: [], constraints: [], breakRhythm: "balanced" }), new Date(), resets);
      for (const r of plan) await putReset(u.uid, r);
      finalResets = sortResets([...resets, ...plan]);
      scheduleDate = dayIso;
    }
  }

  const hydrated: HydratedState = {
    userDoc,
    profile,
    settings,
    resets: sortResets(finalResets),
    checkIns,
    onboarded: userDoc?.onboardingCompleted === true,
    dailyScheduleDate: scheduleDate,
  };
  const cache = loadCachedState(u.uid);
  persistCachedState(u.uid, {
    user: u,
    userDoc: hydrated.userDoc ?? cache.userDoc,
    profile: hydrated.profile ?? cache.profile,
    settings: hydrated.settings ?? cache.settings,
    resets: hydrated.resets,
    checkIns: hydrated.checkIns,
    onboarded: hydrated.onboarded,
    currentResetId: null,
    dailyScheduleDate: hydrated.dailyScheduleDate,
    lastFeeling: undefined,
    lastNeeds: [],
  });
  return hydrated;
}

// ── onboarding ───────────────────────────────────────────────────────────

export async function completeOnboardingFlow(
  u: AuthenticatedMovaUser | null,
  draft: OnboardingDraft,
): Promise<HydratedState> {
  const validationError = validateOnboardingDraft(draft);
  if (validationError) throw new Error(validationError);

  const occupation = draft.occupation === "Other" ? draft.customOccupation!.trim() : draft.occupation.trim();
  const profile: MovaProfile = {
    occupation,
    workStyle: draft.workStyle,
    constraints: draft.constraints,
    breakRhythm: draft.breakRhythm,
    goals: [],
    movementPreference: null,
    preferredActivityTypes: [],
    typicalLocations: [],
    updatedAt: nowIso(),
  };
  const displayName = draft.displayName?.trim() || null;

  if (isFirebaseUser(u)) {
    await ensureUser(u.uid);
    await saveProfile(u.uid, profile);
    const settings = await ensureSettings(u.uid, nowIso());
    await saveUser(u.uid, { displayName, onboardingCompleted: true });
    const plan = buildDailySchedule(profile, new Date());
    for (const r of plan) await putReset(u.uid, r);
    const userDoc: UserDocument = {
      displayName,
      email: null,
      onboardingCompleted: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    return finishHydration(u, {
      userDoc,
      profile,
      settings,
      resets: sortResets(plan),
      checkIns: [],
      onboarded: true,
      dailyScheduleDate: new Date().toISOString(),
    });
  }

  // Offline/local fallback: cache only, no fake Firebase state.
  const settings = (await import("@/lib/mova-types")).defaultSettings();
  const plan = buildDailySchedule(profile, new Date());
  return finishHydration(u, {
    userDoc: { displayName, email: null, onboardingCompleted: true, createdAt: nowIso(), updatedAt: nowIso() },
    profile,
    settings,
    resets: sortResets(plan),
    checkIns: [],
    onboarded: true,
    dailyScheduleDate: new Date().toISOString(),
  });
}

/** Write-through cache after any hydration/onboarding result. */
function finishHydration(u: AuthenticatedMovaUser | null, h: HydratedState): HydratedState {
  const uid = isFirebaseUser(u) ? u.uid : null;
  const cache = loadCachedState(uid);
  persistCachedState(uid, {
    user: u,
    userDoc: h.userDoc ?? cache.userDoc,
    profile: h.profile ?? cache.profile,
    settings: h.settings ?? cache.settings,
    resets: h.resets,
    checkIns: h.checkIns,
    onboarded: h.onboarded,
    currentResetId: null,
    dailyScheduleDate: h.dailyScheduleDate,
    lastFeeling: undefined,
    lastNeeds: [],
  });
  return h;
}

export async function saveProfileFlow(u: AuthenticatedMovaUser | null, p: MovaProfile): Promise<void> {
  if (!isFirebaseUser(u)) return;
  await saveProfile(u.uid, p);
}

export async function saveSettingsFlow(u: AuthenticatedMovaUser | null, settings: MovaSettings): Promise<void> {
  if (!isFirebaseUser(u)) return;
  await saveSettings(u.uid, settings);
}

// ── reset lifecycle ──────────────────────────────────────────────────────

export async function startResetFlow(u: AuthenticatedMovaUser | null, resetId: string, locationContext?: Reset["locationContext"]): Promise<Reset | null> {
  const existing = await loadResetForMutation(u, resetId);
  if (!existing || existing.status !== "scheduled") return null;
  const resolvedContext = locationContext ?? existing.locationContext;
  const started: Reset = {
    ...existing,
    status: "active",
    startedAt: nowIso(),
    updatedAt: nowIso(),
    ...(resolvedContext ? { locationContext: resolvedContext } : {}),
  };
  if (isFirebaseUser(u)) {
    await updateReset(u.uid, resetId, {
      status: "active",
      startedAt: started.startedAt,
      ...(resolvedContext ? { locationContext: resolvedContext } : {}),
    });
  }
  persistResetsQuietly(u, started);
  return started;
}

export async function completeResetFlow(u: AuthenticatedMovaUser | null, resetId: string): Promise<Reset | null> {
  const existing = await loadResetForMutation(u, resetId);
  if (!existing || existing.status !== "active") return null;
  const activity = activityById(existing.activityId);
  if (activity?.verificationType === "camera" && existing.verificationStatus !== "verified") {
    return null;
  }
  const completed: Reset = { ...existing, status: "completed", completedAt: nowIso(), updatedAt: nowIso() };
  if (isFirebaseUser(u)) await updateReset(u.uid, resetId, { status: "completed", completedAt: completed.completedAt, verifiedAt: completed.verifiedAt ?? existing.verifiedAt ?? null });
  persistResetsQuietly(u, completed);
  return completed;
}

export async function verifyResetFlow(
  u: AuthenticatedMovaUser | null,
  resetId: string,
  verification: { status: "verified" | "failed"; method: "camera" | "manual" | "distance" | "timed"; message: string; confidence?: number },
): Promise<Reset | null> {
  const existing = await loadResetForMutation(u, resetId);
  if (!existing) return null;

  const stamp = nowIso();
  const updated: Reset = {
    ...existing,
    verificationStatus: verification.status === "verified" ? "verified" : "failed",
    verificationMethod: verification.method,
    verifiedAt: verification.status === "verified" ? stamp : existing.verifiedAt,
    updatedAt: stamp,
  };

  if (isFirebaseUser(u)) {
    await updateReset(u.uid, resetId, {
      verificationStatus: updated.verificationStatus,
      verificationMethod: updated.verificationMethod,
      verifiedAt: updated.verifiedAt,
      updatedAt: updated.updatedAt,
    });
  }
  persistResetsQuietly(u, updated);
  return updated;
}

export async function skipResetFlow(u: AuthenticatedMovaUser | null, resetId: string): Promise<Reset | null> {
  const existing = await loadResetForMutation(u, resetId);
  if (!existing || existing.status !== "scheduled") return null;
  const skipped: Reset = { ...existing, status: "skipped", updatedAt: nowIso() };
  if (isFirebaseUser(u)) await updateReset(u.uid, resetId, { status: "skipped" });
  persistResetsQuietly(u, skipped);
  return skipped;
}

export async function activateGracePeriodFlow(u: AuthenticatedMovaUser | null, resetId: string, demoMode = false): Promise<Reset | null> {
  const existing = await loadResetForMutation(u, resetId);
  if (!existing) return null;
  // Grace applies to the current intervention target: a due (scheduled) reset or one already started.
  if (existing.status !== "scheduled" && existing.status !== "active") return null;
  // Only one grace period per reset
  if (existing.graceUsed) return null;
  // Don't extend if grace is already active
  if (existing.graceUntil && new Date(existing.graceUntil).getTime() > Date.now()) return existing;

  const stamp = nowIso();
  const graceDurationMs = demoMode ? 15000 : 10 * 60 * 1000; // 15 seconds for demo, 10 minutes for real
  const graceUntil = new Date(Date.now() + graceDurationMs).toISOString();

  const updated: Reset = {
    ...existing,
    graceUntil,
    graceUsed: true,
    updatedAt: stamp,
  };

  if (isFirebaseUser(u)) {
    await updateReset(u.uid, resetId, { graceUntil, graceUsed: true });
  }
  persistResetsQuietly(u, updated);
  return updated;
}

export function checkGraceStatus(reset: Reset): "active" | "in_grace" | "expired" | "used" {
  if (reset.graceUsed && !reset.graceUntil) return "used";
  if (!reset.graceUntil) return "active";
  const now = Date.now();
  const expiresAt = new Date(reset.graceUntil).getTime();
  if (now < expiresAt) return "in_grace";
  return "expired";
}

export function getGraceRemainingMs(reset: Reset): number {
  if (!reset.graceUntil) return 0;
  return Math.max(0, new Date(reset.graceUntil).getTime() - Date.now());
}

/** Local-cache write for offline mode; Firebase remains source of truth. */
function persistResetsQuietly(u: AuthenticatedMovaUser | null, ...updates: Reset[]): void {
  const uid = isFirebaseUser(u) ? u.uid : null;
  const cache = loadCachedState(uid);
  const map = new Map(cache.resets.map((r) => [r.id, r]));
  for (const up of updates) map.set(up.id, up);
  persistCachedState(uid, {
    user: u,
    userDoc: cache.userDoc,
    profile: cache.profile,
    settings: cache.settings,
    resets: sortResets([...map.values()]),
    checkIns: cache.checkIns,
    onboarded: cache.onboarded,
    currentResetId: null,
    dailyScheduleDate: cache.dailyScheduleDate,
    lastFeeling: undefined,
    lastNeeds: [],
  });
}

async function loadResetForMutation(u: AuthenticatedMovaUser | null, resetId: string): Promise<Reset | null> {
  if (isFirebaseUser(u)) {
    const remote = await getReset(u.uid, resetId, fb()).catch(() => null);
    if (remote) return remote;
  }
  const uid = isFirebaseUser(u) ? u.uid : null;
  const cache = loadCachedState(uid);
  return cache.resets.find((r) => r.id === resetId) ?? null;
}

export async function rescheduleResetFlow(
  u: AuthenticatedMovaUser | null,
  resetId: string,
  delayMinutes: number,
  reason: string,
): Promise<{ original: Reset | null; next: Reset | null }> {
  const existing = await loadResetForMutation(u, resetId);
  if (!existing || existing.status !== "scheduled") return { original: null, next: null };
  const stamp = nowIso();
  const original: Reset = { ...existing, status: "rescheduled", rescheduledAt: stamp, rescheduleReason: reason, updatedAt: stamp };
  const newDate = new Date(Date.now() + delayMinutes * 60_000);
  const next: Reset = {
    id: `${resetId}-r${newDate.getTime()}`,
    activityId: existing.activityId,
    status: "scheduled",
    scheduledFor: newDate.toISOString(),
    startedAt: null,
    completedAt: null,
    verifiedAt: null,
    rescheduledAt: null,
    rescheduleReason: null,
    context: "reschedule",
    verificationStatus: "none",
    verificationMethod: existing.verificationMethod,
    distanceMeters: null,
    createdAt: stamp,
    updatedAt: stamp,
    graceUntil: null,
    graceUsed: false,
  };
  if (isFirebaseUser(u)) {
    await updateReset(u.uid, resetId, { status: "rescheduled", rescheduledAt: stamp, rescheduleReason: reason });
    await putReset(u.uid, next);
  }
  persistResetsQuietly(u, original, next);
  return { original, next };
}

// ── check-ins ────────────────────────────────────────────────────────────

export async function saveCheckinFlow(
  u: AuthenticatedMovaUser | null,
  input: { resetId: string; feeling: string; needs: string[] },
): Promise<CheckIn> {
  const stamp = nowIso();
  const local: CheckIn = { id: `local-${Date.now()}`, resetId: input.resetId, feeling: input.feeling, needs: input.needs, createdAt: stamp };
  if (isFirebaseUser(u)) {
    const id = await addCheckInDoc(u.uid, input).catch(() => null);
    if (id) return { ...local, id };
  }
  persistResetsQuietlyNoChanges(u, local);
  return local;
}

/** Cache-only check-in append for offline mode. */
function persistResetsQuietlyNoChanges(
  u: AuthenticatedMovaUser | null,
  checkIn: CheckIn,
): void {
  const uid = isFirebaseUser(u) ? u.uid : null;
  const cache = loadCachedState(uid);
  persistCachedState(uid, {
    user: u,
    userDoc: cache.userDoc,
    profile: cache.profile,
    settings: cache.settings,
    resets: cache.resets,
    checkIns: [checkIn, ...cache.checkIns],
    onboarded: cache.onboarded,
    currentResetId: null,
    dailyScheduleDate: cache.dailyScheduleDate,
    lastFeeling: checkIn.feeling,
    lastNeeds: checkIn.needs,
  });
}



