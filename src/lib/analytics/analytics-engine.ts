import { getActivity } from "@/lib/mova-activities";
import type { CheckIn, Reset } from "@/lib/mova-types";
import type {
  ActivityAnalytics,
  AnalyticsSummary,
  ContextAnalytics,
  Reward,
  TimeWindow,
  TimeWindowAnalytics,
} from "@/lib/analytics/analytics-types";

function localDayKey(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function diffDays(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const A = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const B = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((A - B) / msPerDay);
}

function getTimeWindow(iso: string | null | undefined): TimeWindow {
  if (!iso) return "morning";
  const hour = new Date(iso).getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function getEligibleResets(resets: Reset[]): Reset[] {
  const now = Date.now();
  return resets.filter((reset) => {
    const when = new Date(reset.scheduledFor).getTime();
    return when <= now;
  });
}

function calculateStreaks(resets: Reset[]): { current: number; longest: number } {
  const completedDates = [...new Set(
    resets
      .filter((reset) => reset.status === "completed" && reset.completedAt)
      .map((reset) => localDayKey(reset.completedAt))
      .filter(Boolean),
  )].sort((a, b) => b.localeCompare(a));

  if (completedDates.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let current = 1;
  let prevDate = new Date(`${completedDates[0]}T12:00:00`);

  for (let i = 1; i < completedDates.length; i += 1) {
    const next = new Date(`${completedDates[i]}T12:00:00`);
    const gap = diffDays(prevDate, next);
    if (gap === 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
    prevDate = next;
  }

  return { current: current, longest };
}

export function calculateCompletionRate(resets: Reset[]): number {
  const eligible = getEligibleResets(resets);
  if (eligible.length === 0) return 0;
  const completed = eligible.filter((reset) => reset.status === "completed").length;
  return Math.round((completed / eligible.length) * 100);
}

export function calculateTotalMovementMinutes(resets: Reset[]): number {
  return resets
    .filter((reset) => reset.status === "completed")
    .reduce((sum, reset) => {
      const activity = getActivity(reset.activityId);
      return sum + (activity?.durationSeconds ?? 0) / 60;
    }, 0);
}

export function calculateWalkingDistanceMeters(resets: Reset[]): number {
  return resets
    .filter((reset) => reset.status === "completed")
    .reduce((sum, reset) => {
      const activity = getActivity(reset.activityId);
      if (activity?.category === "walking") {
        return sum + (reset.distanceMeters ?? 0);
      }
      return sum;
    }, 0);
}

export function calculateWalkingDistanceMetersForDay(resets: Reset[], dayIso: string): number {
  const targetDay = localDayKey(dayIso);
  return resets
    .filter((reset) => reset.status === "completed" && reset.completedAt && localDayKey(reset.completedAt) === targetDay)
    .reduce((sum, reset) => {
      const activity = getActivity(reset.activityId);
      if (activity?.category === "walking") {
        return sum + (reset.distanceMeters ?? 0);
      }
      return sum;
    }, 0);
}

export function calculateWalkingDistanceMetersForWeek(resets: Reset[], weekStartIso: string): number {
  const start = new Date(weekStartIso);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  return resets
    .filter((reset) => {
      if (reset.status !== "completed" || !reset.completedAt) return false;
      const completed = new Date(reset.completedAt);
      return completed >= start && completed < end;
    })
    .reduce((sum, reset) => {
      const activity = getActivity(reset.activityId);
      if (activity?.category === "walking") {
        return sum + (reset.distanceMeters ?? 0);
      }
      return sum;
    }, 0);
}

export function countWalkingResetsForDay(resets: Reset[], dayIso: string): number {
  const targetDay = localDayKey(dayIso);
  return resets
    .filter((reset) => reset.status === "completed" && reset.completedAt && localDayKey(reset.completedAt) === targetDay)
    .filter((reset) => getActivity(reset.activityId)?.category === "walking").length;
}

export function calculateActiveDays(resets: Reset[]): number {
  const active = new Set(
    resets
      .filter((reset) => reset.status === "completed" && reset.completedAt)
      .map((reset) => localDayKey(reset.completedAt)),
  );
  return [...active].filter(Boolean).length;
}

export function calculateConsistencyScore(resets: Reset[]): number {
  const rate = calculateCompletionRate(resets);
  const activeDays = calculateActiveDays(resets);
  const streak = calculateStreaks(resets).current;
  const movementMinutes = calculateTotalMovementMinutes(resets);

  const score = Math.min(
    100,
    Math.round(rate * 0.5 + Math.min(activeDays * 5, 25) + Math.min(streak * 8, 20) + Math.min(movementMinutes / 6, 30)),
  );

  return Math.max(0, score);
}

export function calculateActivityAnalytics(resets: Reset[]): ActivityAnalytics[] {
  const map = new Map<string, { activityId: string; activityName: string; category: string; completed: number; skipped: number; rescheduled: number; }>();

  for (const reset of resets) {
    const activity = getActivity(reset.activityId);
    const key = reset.activityId || "unknown";
    const entry = map.get(key) ?? {
      activityId: key,
      activityName: activity?.name ?? "Reset",
      category: activity?.category ?? "movement",
      completed: 0,
      skipped: 0,
      rescheduled: 0,
    };

    if (reset.status === "completed") entry.completed += 1;
    if (reset.status === "skipped") entry.skipped += 1;
    if (reset.status === "rescheduled") entry.rescheduled += 1;

    map.set(key, entry);
  }

  return [...map.values()]
    .map((entry) => {
      const total = entry.completed + entry.skipped + entry.rescheduled || 1;
      const completionRate = Math.round((entry.completed / total) * 100);
      const activity = getActivity(entry.activityId);
      return {
        activityId: entry.activityId,
        activityName: entry.activityName,
        category: entry.category,
        completed: entry.completed,
        skipped: entry.skipped,
        rescheduled: entry.rescheduled,
        completionRate,
        totalMinutes: resets
          .filter((reset) => reset.activityId === entry.activityId && reset.status === "completed")
          .reduce((sum, reset) => sum + (activity?.durationSeconds ?? 0) / 60, 0),
      };
    })
    .sort((a, b) => b.completed - a.completed || b.totalMinutes - a.totalMinutes);
}

export function calculateContextAnalytics(resets: Reset[]): ContextAnalytics[] {
  const contexts = ["schedule", "reschedule", "manual"] as const;
  return contexts.map((context) => {
    const values = resets.filter((reset) => reset.context === context);
    const completed = values.filter((reset) => reset.status === "completed").length;
    const skipped = values.filter((reset) => reset.status === "skipped").length;
    const denominator = values.length || 1;
    return {
      context,
      completed,
      skipped,
      completionRate: Math.round((completed / denominator) * 100),
    };
  });
}

export function calculateTimeWindowAnalytics(resets: Reset[]): TimeWindowAnalytics[] {
  const timeWindows: TimeWindow[] = ["morning", "afternoon", "evening"];
  return timeWindows.map((window) => {
    const values = resets.filter((reset) => getTimeWindow(reset.completedAt ?? reset.scheduledFor) === window);
    const completed = values.filter((reset) => reset.status === "completed").length;
    const skipped = values.filter((reset) => reset.status === "skipped").length;
    const denominator = values.length || 1;
    return {
      timeWindow: window,
      completed,
      skipped,
      completionRate: Math.round((completed / denominator) * 100),
    };
  });
}

export function calculateRewards(resets: Reset[], checks: CheckIn[]): Reward[] {
  const completed = resets.filter((reset) => reset.status === "completed").length;
  const streak = calculateStreaks(resets).current;
  const walkingDistance = calculateWalkingDistanceMeters(resets);
  const consistency = calculateConsistencyScore(resets);

  const rewardDefinitions = [
    { id: "first-reset", name: "First move", description: "Complete your first reset.", type: "completion_count", threshold: 1, icon: "✦" },
    { id: "three-resets", name: "Momentum", description: "Complete 3 resets.", type: "completion_count", threshold: 3, icon: "✓" },
    { id: "five-resets", name: "Steady rhythm", description: "Complete 5 resets.", type: "completion_count", threshold: 5, icon: "◎" },
    { id: "three-day-streak", name: "Consistency streak", description: "Hit a 3-day reset streak.", type: "streak", threshold: 3, icon: "⏳" },
    { id: "walking-goal", name: "Walk it out", description: "Complete 1 km of walking resets.", type: "walking_distance", threshold: 1000, icon: "↗" },
    { id: "strong-consistency", name: "Strong rhythm", description: "Reach 75% consistency score.", type: "consistency", threshold: 75, icon: "◈" },
  ] as const;

  return rewardDefinitions.map((reward) => {
    const progressValue =
      reward.type === "completion_count"
        ? completed
        : reward.type === "streak"
          ? streak
          : reward.type === "walking_distance"
            ? walkingDistance
            : consistency;

    const unlocked = progressValue >= reward.threshold;
    const unlockedAt = unlocked ? new Date().toISOString() : null;

    return {
      id: reward.id,
      name: reward.name,
      description: reward.description,
      type: reward.type,
      threshold: reward.threshold,
      icon: reward.icon,
      unlockedAt,
      progress: Math.min(progressValue, reward.threshold),
      total: reward.threshold,
      unlocked,
    };
  });
}

export function buildAnalyticsSummary(resets: Reset[], checkIns: CheckIn[]): AnalyticsSummary {
  const completed = resets.filter((reset) => reset.status === "completed");
  const skipped = resets.filter((reset) => reset.status === "skipped");
  const rescheduled = resets.filter((reset) => reset.status === "rescheduled");
  const summary = {
    totalResets: resets.length,
    completedResets: completed.length,
    skippedResets: skipped.length,
    rescheduledResets: rescheduled.length,
    completionRate: calculateCompletionRate(resets),
    currentStreak: calculateStreaks(resets).current,
    longestStreak: calculateStreaks(resets).longest,
    totalMovementMinutes: calculateTotalMovementMinutes(resets),
    totalWalkingDistanceMeters: calculateWalkingDistanceMeters(resets),
    activeDays: calculateActiveDays(resets),
    consistencyScore: calculateConsistencyScore(resets),
    timePattern: ((): TimeWindow => {
      const timeBreakdown = calculateTimeWindowAnalytics(resets);
      const best = timeBreakdown.sort((a, b) => b.completed - a.completed)[0];
      return best?.timeWindow ?? "morning";
    })(),
    activityBreakdown: calculateActivityAnalytics(resets),
    contextBreakdown: calculateContextAnalytics(resets),
    timeBreakdown: calculateTimeWindowAnalytics(resets),
    rewards: calculateRewards(resets, checkIns),
  } satisfies AnalyticsSummary;

  return summary;
}
