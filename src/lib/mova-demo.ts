// Competition Demo Mode for MOVA.
// Isolated from real user data. Same UI/domain interfaces; different data/control source.
// Do not use this module outside demo mode.

import { nowIso, defaultSettings } from "@/lib/mova-types";
import { buildAnalyticsSummary } from "@/lib/analytics/analytics-engine";
import { buildBehaviorSummary } from "@/lib/intelligence/behavior-engine";
import { getActivity } from "@/lib/mova-activities";
import type { CheckIn, MovaProfile, MovaSettings, Reset, WalkingSession } from "@/lib/mova-types";
import type { LocationContext, SavedPlace } from "@/lib/location/location-types";
import type { Reminder, ReminderStatus } from "@/lib/notifications/notification-types";

export const DEMO_NAMESPACE = "mova-demo-mode-v1";

// Demo persona
export const DEMO_USER = {
  uid: "demo-user",
  isAnonymous: true,
  displayName: "Jordan",
  email: null,
} as const;

export const DEMO_PROFILE: MovaProfile = {
  occupation: "Healthcare",
  workStyle: ["Mostly sitting", "Screen-heavy", "Mentally demanding"],
  constraints: ["I can't use my phone while working", "I usually work at a desk"],
  breakRhythm: "Every hour",
  goals: ["Less stress", "Better focus"],
  movementPreference: "movement",
  preferredActivityTypes: ["stretch", "breathing"],
  typicalLocations: ["work"],
  updatedAt: nowIso(),
};

export const DEMO_SETTINGS = defaultSettings();

// Demo context seeds
const DEMO_WORK_PLACE: SavedPlace = {
  id: "work",
  label: "work",
  latitude: 51.5074,
  longitude: -0.1278,
  radiusMeters: 250,
  createdAt: nowIso(),
  updatedAt: nowIso(),
};

// Demo state store (isolated)
type DemoContext = {
  demo: boolean;
  persona: (typeof DEMO_USER) | null;
  profile: MovaProfile | null;
  settings: MovaSettings | null;
  resets: Reset[];
  checkIns: CheckIn[];
  savedPlaces: SavedPlace[];
  currentContext: LocationContext;
  demoReminders: Reminder[];
  walkingSession: WalkingSession | null;
};

const EMPTY_DEMO_CONTEXT: DemoContext = {
  demo: false,
  persona: null,
  profile: null,
  settings: null,
  resets: [],
  checkIns: [],
  savedPlaces: [],
  currentContext: "unknown",
  demoReminders: [],
  walkingSession: null,
};

function readDemoContext(): DemoContext {
  if (typeof window === "undefined") return EMPTY_DEMO_CONTEXT;
  try {
    const raw = localStorage.getItem(DEMO_NAMESPACE);
    if (!raw) return EMPTY_DEMO_CONTEXT;
    const parsed = JSON.parse(raw) as DemoContext;
    if (!parsed || typeof parsed !== "object") return EMPTY_DEMO_CONTEXT;
    return parsed;
  } catch {
    return EMPTY_DEMO_CONTEXT;
  }
}

function writeDemoContext(ctx: DemoContext): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DEMO_NAMESPACE, JSON.stringify(ctx));
  } catch {
    /* ignore */
  }
}

// Demo reset factory
function demoResetId(suffix: string): string {
  return `demo-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function demoReset(activityId: string, status: Reset["status"], scheduledFor: string, context: Reset["context"] = "manual", verificationMethod?: Reset["verificationMethod"]): Reset {
  const now = nowIso();
  const activity = getActivity(activityId);
  return {
    id: demoResetId(activityId),
    activityId,
    status,
    scheduledFor,
    startedAt: status === "active" ? now : null,
    completedAt: status === "completed" ? now : null,
    verifiedAt: status === "completed" ? now : null,
    rescheduledAt: status === "rescheduled" ? now : null,
    rescheduleReason: status === "rescheduled" ? "Not possible right now" : null,
    context,
    verificationStatus: status === "completed" ? "verified" : "none",
    verificationMethod: verificationMethod ?? (activity?.verificationType ?? "manual"),
    distanceMeters: null,
    createdAt: now,
    updatedAt: now,
    graceUntil: null,
    graceUsed: false,
  };
}

// Demo history seed
export function createDemoHistory(): {
  resets: Reset[];
  checkIns: CheckIn[];
  savedPlaces: SavedPlace[];
  walkingSession: WalkingSession | null;
} {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const completed1 = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);
  const completed1Iso = completed1.toISOString();

  const completed2 = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
  const completed2Iso = completed2.toISOString();

  const completed3 = new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000);
  const completed3Iso = completed3.toISOString();

  const skipped = new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000);
  const skippedIso = skipped.toISOString();

  const rescheduled = new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000);
  const rescheduledIso = rescheduled.toISOString();

  const scheduled = new Date(Date.now() + 20 * 60 * 1000);
  const scheduledIso = scheduled.toISOString();

  const walkingCompleted = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000);
  const walkingCompletedIso = walkingCompleted.toISOString();

  const resets: Reset[] = [
    demoReset("neck-shoulder-reset", "completed", completed1Iso, "manual"),
    demoReset("desk-stretch", "completed", completed2Iso, "manual"),
    demoReset("short-walk", "completed", walkingCompletedIso, "manual", "distance"),
    demoReset("deep-breathing", "completed", completed3Iso, "manual", "timed"),
    demoReset("standing-reset", "skipped", skippedIso, "manual"),
    demoReset("hip-mobility", "rescheduled", rescheduledIso, "manual"),
    demoReset("neck-shoulder-reset", "scheduled", scheduledIso, "schedule", "manual"),
  ];

  const walkingReset = resets.find((r) => r.activityId === "short-walk") ?? null;
  if (walkingReset) {
    walkingReset.distanceMeters = 1200;
    walkingReset.status = "completed";
    walkingReset.completedAt = walkingCompletedIso;
    walkingReset.verifiedAt = walkingCompletedIso;
    walkingReset.verificationStatus = "verified";
    walkingReset.verificationMethod = "distance";
  }

  const checkIns: CheckIn[] = [
    { id: demoResetId("checkin-1"), resetId: resets[0]!.id, feeling: "Better", needs: ["Less stress"], createdAt: completed1Iso },
    { id: demoResetId("checkin-2"), resetId: resets[1]!.id, feeling: "Much better", needs: ["Better focus", "Physical movement"], createdAt: completed2Iso },
    { id: demoResetId("checkin-3"), resetId: resets[2]!.id, feeling: "Better", needs: ["Water", "Another short break"], createdAt: walkingCompletedIso },
    { id: demoResetId("checkin-4"), resetId: resets[3]!.id, feeling: "About the same", needs: ["Quiet"], createdAt: completed3Iso },
  ];

  return {
    resets,
    checkIns,
    savedPlaces: [DEMO_WORK_PLACE],
    walkingSession: null,
  };
}

// Demo API
export function isDemoMode(): boolean {
  return readDemoContext().demo;
}

export function enterDemoMode(): DemoContext {
  const seeded = createDemoHistory();
  const ctx: DemoContext = {
    demo: true,
    persona: DEMO_USER,
    profile: DEMO_PROFILE,
    settings: DEMO_SETTINGS,
    resets: seeded.resets,
    checkIns: seeded.checkIns,
    savedPlaces: seeded.savedPlaces,
    currentContext: "work",
    demoReminders: [],
    walkingSession: null,
  };
  writeDemoContext(ctx);
  return ctx;
}

export function exitDemoMode(): DemoContext {
  const ctx: DemoContext = { ...EMPTY_DEMO_CONTEXT, demo: false };
  writeDemoContext(ctx);
  return ctx;
}

export function resetDemo(): DemoContext {
  return enterDemoMode();
}

export function setDemoContext(context: LocationContext): DemoContext {
  const ctx = readDemoContext();
  if (!ctx.demo) return ctx;
  ctx.currentContext = context;
  writeDemoContext(ctx);
  return ctx;
}

// Accelerated demo grace: 15s stands in for the real 10-minute grace period so
// judges can watch the intervention leave and return. Same domain fields
// (graceUntil / graceUsed) as the real product.
export const DEMO_GRACE_MS = 15_000;
export const REAL_GRACE_MS = 10 * 60_000;

export function activateDemoGrace(resetId: string): Reset | null {
  const ctx = readDemoContext();
  if (!ctx.demo) return null;
  const reset = ctx.resets.find((r) => r.id === resetId);
  if (!reset) return null;
  if (reset.status !== "scheduled" && reset.status !== "active") return null;
  // One grace period per reset.
  if (reset.graceUsed) return null;
  if (reset.graceUntil && new Date(reset.graceUntil).getTime() > Date.now()) return reset;
  reset.graceUntil = new Date(Date.now() + DEMO_GRACE_MS).toISOString();
  reset.graceUsed = true;
  reset.updatedAt = nowIso();
  writeDemoContext(ctx);
  return reset;
}

export function triggerNextDemoReset(): { reminder: Reminder; reset: Reset | null } {
  const ctx = readDemoContext();
  if (!ctx.demo) return { reminder: emptyReminder(), reset: null };
  const scheduled = ctx.resets.find((r) => r.status === "scheduled");
  if (!scheduled) return { reminder: emptyReminder(), reset: null };

  const activity = getActivity(scheduled.activityId);
  scheduled.scheduledFor = nowIso();
  const reminder: Reminder = {
    id: `rem-${scheduled.id}-${Date.now()}`,
    resetId: scheduled.id,
    scheduledFor: scheduled.scheduledFor,
    title: "Time for a MOVA reset",
    body: (activity?.name ?? "Reset") + " ? a short reset before the next work block.",
    status: "triggered",
    createdAt: nowIso(),
    triggeredAt: nowIso(),
    openedAt: null,
  };

  ctx.demoReminders = [reminder, ...ctx.demoReminders];
  scheduled.updatedAt = nowIso();

  writeDemoContext(ctx);
  return { reminder, reset: scheduled };
}

export function startDemoReset(resetId: string): Reset | null {
  const ctx = readDemoContext();
  if (!ctx.demo) return null;
  const reset = ctx.resets.find((r) => r.id === resetId);
  if (!reset || reset.status !== "scheduled") return null;
  reset.status = "active";
  reset.startedAt = nowIso();
  reset.context = "manual";
  reset.locationContext = ctx.currentContext;
  reset.verificationStatus = "not_started";
  reset.updatedAt = nowIso();
  writeDemoContext(ctx);
  return reset;
}

export function dismissDemoReminder(reminderId: string): DemoContext {
  const ctx = readDemoContext();
  if (!ctx.demo) return ctx;
  const r = ctx.demoReminders.find((x) => x.id === reminderId);
  const reset = r ? ctx.resets.find((candidate) => candidate.id === r.resetId) : null;
  if (r && reset && reset.status !== "scheduled" && reset.status !== "active") {
    r.status = "dismissed";
    writeDemoContext(ctx);
  }
  return ctx;
}

export function completeDemoWalking(resetId: string, distanceMeters: number): Reset | null {
  const ctx = readDemoContext();
  if (!ctx.demo) return null;
  const reset = ctx.resets.find((r) => r.id === resetId);
  if (!reset || reset.status !== "active" || distanceMeters < 100) return null;
  reset.verifiedAt = nowIso();
  reset.verificationStatus = "verified";
  reset.verificationMethod = "distance";
  reset.distanceMeters = distanceMeters;
  reset.updatedAt = nowIso();
  writeDemoContext(ctx);
  return completeDemoReset(resetId);
}

export function verifyDemoReset(resetId: string, method: "camera" | "manual" | "distance" | "timed", message: string, confidence = 0.92): Reset | null {
  const ctx = readDemoContext();
  if (!ctx.demo) return null;
  const reset = ctx.resets.find((r) => r.id === resetId);
  if (!reset) return null;
  if (reset.status !== "active") return null;
  reset.verifiedAt = nowIso();
  reset.verificationStatus = "verified";
  reset.verificationMethod = method;
  reset.updatedAt = nowIso();
  writeDemoContext(ctx);
  return reset;
}

export function completeDemoReset(resetId: string): Reset | null {
  const ctx = readDemoContext();
  if (!ctx.demo) return null;
  const reset = ctx.resets.find((r) => r.id === resetId);
  if (!reset || reset.status !== "active" || reset.verificationStatus !== "verified") return null;
  reset.status = "completed";
  reset.completedAt = nowIso();
  reset.updatedAt = nowIso();
  ctx.demoReminders = ctx.demoReminders.map((reminder) => reminder.resetId === resetId ? { ...reminder, status: "completed" } : reminder);
  writeDemoContext(ctx);
  return reset;
}

export function addDemoCheckin(resetId: string, feeling: string, needs: string[]): CheckIn {
  const ctx = readDemoContext();
  if (!ctx.demo) {
    return { id: demoResetId("checkin"), resetId, feeling, needs, createdAt: nowIso() };
  }
  const checkin: CheckIn = {
    id: demoResetId("checkin"),
    resetId,
    feeling,
    needs,
    createdAt: nowIso(),
  };
  ctx.checkIns = [checkin, ...ctx.checkIns];
  writeDemoContext(ctx);
  return checkin;
}

export function setDemoWalkingSession(session: WalkingSession | null): DemoContext {
  const ctx = readDemoContext();
  if (!ctx.demo) return ctx;
  ctx.walkingSession = session;
  writeDemoContext(ctx);
  return ctx;
}

// Derived demo analytics (computed, not hardcoded)
export function demoAnalytics(): ReturnType<typeof buildAnalyticsSummary> {
  const ctx = readDemoContext();
  if (!ctx.demo) return buildAnalyticsSummary([], []);
  return buildAnalyticsSummary(ctx.resets, ctx.checkIns);
}

export function demoBehavior(): ReturnType<typeof buildBehaviorSummary> {
  const ctx = readDemoContext();
  if (!ctx.demo) return buildBehaviorSummary(null, [], []);
  return buildBehaviorSummary(ctx.profile, ctx.resets, ctx.checkIns);
}

// Helpers
export function ensureDemoContext(): DemoContext {
  const ctx = readDemoContext();
  if (ctx.demo) return ctx;
  return enterDemoMode();
}
export { readDemoContext };


function emptyReminder(): Reminder {
  return {
    id: "",
    resetId: "",
    scheduledFor: "",
    title: "",
    body: "",
    status: "scheduled" as ReminderStatus,
    createdAt: "",
    triggeredAt: null,
    openedAt: null,
  };
}

export type DemoContextApi = {
  isDemoMode: () => boolean;
  enterDemoMode: () => DemoContext;
  exitDemoMode: () => DemoContext;
  resetDemo: () => DemoContext;
  setDemoContext: (context: LocationContext) => DemoContext;
  triggerNextDemoReset: () => { reminder: Reminder; reset: Reset | null };
  startDemoReset: (resetId: string) => Reset | null;
  completeDemoReset: (resetId: string) => Reset | null;
  activateDemoGrace: (resetId: string) => Reset | null;
  dismissDemoReminder: (reminderId: string) => DemoContext;
  completeDemoWalking: (resetId: string, distanceMeters: number) => Reset | null;
  verifyDemoReset: (resetId: string, method: "camera" | "manual" | "distance" | "timed", message: string, confidence?: number) => Reset | null;
  addDemoCheckin: (resetId: string, feeling: string, needs: string[]) => CheckIn;
  setDemoWalkingSession: (session: WalkingSession | null) => DemoContext;
  demoAnalytics: () => ReturnType<typeof buildAnalyticsSummary>;
  demoBehavior: () => ReturnType<typeof buildBehaviorSummary>;
  ensureDemoContext: () => DemoContext;
  readDemoContext: () => DemoContext;
};
