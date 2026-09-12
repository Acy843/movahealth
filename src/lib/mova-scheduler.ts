// Phase 2 deterministic scheduler. No AI, no GPS, no notifications.
// Idempotent: deterministic reset IDs keyed by (uid, date, slot index).

import { selectActivitiesForProfile } from "@/lib/mova-activities";
import { adaptiveSlotMinutes, rankActivitiesForBehavior } from "@/lib/intelligence/behavior-engine";
import { putReset } from "@/lib/mova-repo";
import type { MovaProfile, Reset } from "@/lib/mova-types";

export type SchedulePlan = {
  scheduleDate: string;
  resets: Reset[];
};

type Slot = { hour: number; minute: number };

function slotsForBreakRhythm(breakRhythm: string): Slot[] {
  if (breakRhythm === "frequent") {
    return [
      { hour: 9, minute: 30 },
      { hour: 11, minute: 0 },
      { hour: 14, minute: 0 },
      { hour: 15, minute: 30 },
      { hour: 17, minute: 0 },
    ];
  }
  if (breakRhythm === "moderate") {
    return [
      { hour: 10, minute: 30 },
      { hour: 13, minute: 0 },
      { hour: 15, minute: 30 },
    ];
  }
  // "long" or unknown
  return [
    { hour: 11, minute: 0 },
    { hour: 15, minute: 0 },
  ];
}

export function planScheduleForProfile(profile: MovaProfile, dayIso: string, history: Reset[] = []): SchedulePlan {
  const slots = slotsForBreakRhythm(profile.breakRhythm);
  const pool = rankActivitiesForBehavior(profile, history, selectActivitiesForProfile(profile));
  const baseMinutes = slots.map((slot) => slot.hour * 60 + slot.minute);
  const adaptiveMinutes = adaptiveSlotMinutes(profile, history, baseMinutes);
  const now = new Date();
  const resets: Reset[] = [];
  adaptiveMinutes.forEach((minutes, i) => {
    const d = new Date(dayIso);
    d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    if (d.getTime() <= now.getTime()) return; // don't schedule in the past
    const activity = pool.find((candidate) => candidate && !resets.some((reset) => reset.activityId === candidate.id)) ?? pool[i % pool.length];
    if (!activity) return;
    const id = `sch-${dayIso}-${Math.floor(minutes / 60)}${String(minutes % 60).padStart(2, "0")}`;
    const iso = d.toISOString();
    resets.push({
      id,
      activityId: activity.id,
      status: "scheduled",
      scheduledFor: iso,
      startedAt: null,
      completedAt: null,
      verifiedAt: null,
      rescheduledAt: null,
      rescheduleReason: null,
      context: "schedule",
      verificationStatus: "none",
      verificationMethod: activity.verificationType,
      distanceMeters: null,
      createdAt: iso,
      updatedAt: iso,
      graceUntil: null,
      graceUsed: false,
    });
  });
  return { scheduleDate: dayIso, resets };
}

/**
 * Idempotency: reset IDs are deterministic (`sch-YYYY-MM-DD-HHMM`).
 * A reset only needs writing if its ID is missing from today's existing set.
 * Re-entering Home never duplicates the schedule.
 */
export async function hydrateInitialSchedule(
  uid: string,
  profile: MovaProfile,
  existing: Reset[],
): Promise<{ created: Reset[]; scheduleDate: string }> {
  const dayIso = new Date().toISOString().slice(0, 10);
  const plan = planScheduleForProfile(profile, dayIso, existing);
  const existingIds = new Set(existing.map((r) => r.id));
  const created: Reset[] = [];
  for (const r of plan.resets) {
    if (existingIds.has(r.id)) continue;
    await putReset(uid, r);
    created.push(r);
  }
  return { created, scheduleDate: plan.scheduleDate };
}

export function buildDailySchedule(profile: MovaProfile, now: Date, history: Reset[] = []): Reset[] {
  const dayIso = now.toISOString().slice(0, 10);
  const plan = planScheduleForProfile(profile, dayIso, history);
  return plan.resets;
}

