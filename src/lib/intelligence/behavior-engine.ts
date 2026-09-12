import { getActivity } from "@/lib/mova-activities";
import type { CheckIn, MovaProfile, Reset } from "@/lib/mova-types";

export type LearningStage = "new" | "observing" | "early-patterns" | "personalized" | "well-understood";

export type BehavioralInsight = {
  id: string;
  type: "activity" | "time" | "duration" | "flexibility" | "avoidance";
  statement: string;
  evidenceCount: number;
  confidence: number;
  firstObservedAt: string;
  lastObservedAt: string;
  supportingSignals: string[];
};

export type BehavioralFriction = {
  context: string | null;
  activityType: string | null;
  timeWindow: string | null;
  durationRange: string | null;
  score: number;
  evidenceCount: number;
  confidence: number;
  lastObservedAt: string;
};

export type RecommendationReason = {
  id: string;
  label: string;
  weight: number;
};

export type BehaviorSummary = {
  bestCategory: string;
  bestActivityName: string;
  toughestPeriod: string;
  rhythmScore: number;
  completionRate: number;
  recommendationText: string;
  patternSummary: string;
  signals: string[];
  learningStage: LearningStage;
  meaningfulCompletions: number;
  activeDays: number;
  insights: BehavioralInsight[];
  frictions: BehavioralFriction[];
  recommendationReasons: RecommendationReason[];
  preferredWindow: Window | null;
  scheduleShiftMinutes: number;
  frequencyPerDay: number;
  disruptionDetected: boolean;
};

type Window = "morning" | "afternoon" | "evening";

const WINDOWS: readonly Window[] = ["morning", "afternoon", "evening"];

function dayKey(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function windowFor(iso: string): Window {
  const hour = new Date(iso).getHours();
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

function title(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function dateRange(values: Reset[]): { first: string; last: string } {
  const dates = values
    .map((reset) => reset.completedAt ?? reset.scheduledFor)
    .filter(Boolean)
    .sort();
  return { first: dates[0] ?? new Date().toISOString(), last: dates.at(-1) ?? new Date().toISOString() };
}

function stageFor(completed: number, activeDays: number): LearningStage {
  if (completed < 3 || activeDays < 2) return "new";
  if (completed < 6 || activeDays < 3) return "observing";
  if (completed < 10 || activeDays < 5) return "early-patterns";
  if (completed < 18 || activeDays < 8) return "personalized";
  return "well-understood";
}

function evidenceConfidence(count: number, days: number, rate: number): number {
  return Math.min(0.98, Number((0.25 + count / 20 + days / 20 + rate * 0.25).toFixed(2)));
}

function insightFor(
  id: BehavioralInsight["id"],
  type: BehavioralInsight["type"],
  statement: string,
  evidence: Reset[],
  rate: number,
  supportingSignals: string[],
): BehavioralInsight {
  const range = dateRange(evidence);
  const days = new Set(evidence.map((reset) => dayKey(reset.completedAt ?? reset.scheduledFor)).filter(Boolean)).size;
  return {
    id,
    type,
    statement,
    evidenceCount: evidence.length,
    confidence: evidenceConfidence(evidence.length, days, rate),
    firstObservedAt: range.first,
    lastObservedAt: range.last,
    supportingSignals,
  };
}

function recencyWeight(reset: Reset): number {
  const stamp = new Date(reset.completedAt ?? reset.scheduledFor).getTime();
  const ageDays = Math.max(0, (Date.now() - stamp) / 86_400_000);
  return Math.exp(-ageDays / 21);
}

function durationRange(seconds: number): string {
  if (seconds <= 120) return "short";
  if (seconds <= 300) return "medium";
  return "long";
}

function buildFriction(resets: Reset[]): BehavioralFriction[] {
  const frictionGroups = new Map<string, Reset[]>();
  for (const reset of resets) {
    if (!["skipped", "rescheduled"].includes(reset.status) && !reset.graceUsed) continue;
    const activity = getActivity(reset.activityId);
    const key = [reset.locationContext ?? "unknown", activity?.category ?? "movement", windowFor(reset.scheduledFor), durationRange(activity?.durationSeconds ?? 0)].join("|");
    frictionGroups.set(key, [...(frictionGroups.get(key) ?? []), reset]);
  }
  return [...frictionGroups.entries()].map(([key, values]) => {
    const [context, activityType, timeWindow, duration] = key.split("|");
    const last = values.map((value) => value.updatedAt).sort().at(-1) ?? new Date().toISOString();
    const score = Math.min(1, values.reduce((sum, value) => sum + (value.status === "skipped" ? 1 : 0.7), 0) / 5);
    const days = new Set(values.map((value) => dayKey(value.scheduledFor)).filter(Boolean)).size;
    return {
      context: context && context !== "unknown" ? context : null,
      activityType: activityType ?? null,
      timeWindow: timeWindow ?? null,
      durationRange: duration ?? null,
      score: Number(score.toFixed(2)),
      evidenceCount: values.length,
      confidence: evidenceConfidence(values.length, days, score),
      lastObservedAt: last,
    };
  }).filter((friction) => friction.evidenceCount >= 2);
}

export function buildBehaviorSummary(
  profile: MovaProfile | null,
  resets: Reset[],
  checkIns: CheckIn[],
  suppressedInsightIds: string[] = [],
): BehaviorSummary {
  const observed = resets.filter((reset) => ["completed", "skipped", "rescheduled"].includes(reset.status));
  const completed = observed.filter((reset) => reset.status === "completed");
  const activeDays = new Set(completed.map((reset) => dayKey(reset.completedAt)).filter(Boolean)).size;
  const completionRate = observed.length === 0 ? 0 : Math.round((completed.length / observed.length) * 100);
  const learningStage = stageFor(completed.length, activeDays);

  const categoryCounts = new Map<string, { score: number; resets: Reset[] }>();
  for (const reset of completed) {
    const activity = getActivity(reset.activityId);
    const category = activity?.category ?? "movement";
    const entry = categoryCounts.get(category) ?? { score: 0, resets: [] };
    entry.score += recencyWeight(reset);
    entry.resets.push(reset);
    categoryCounts.set(category, entry);
  }

  const bestEntry = [...categoryCounts.entries()].sort((a, b) => b[1].score - a[1].score)[0];
  const bestCategory = bestEntry?.[0] ?? "movement";
  const bestCategoryResets = bestEntry?.[1].resets ?? [];

  const preferredName = getActivity(bestCategoryResets.at(-1)?.activityId)?.name ?? "Movement reset";
  const insights: BehavioralInsight[] = [];

  if (bestCategoryResets.length >= 3 && new Set(bestCategoryResets.map((reset) => dayKey(reset.completedAt))).size >= 2) {
    const rate = bestCategoryResets.length / Math.max(1, completed.length);
    insights.push(insightFor("activity-category", "activity", `You are completing ${bestCategory} resets more often lately.`, bestCategoryResets, rate, [`${bestCategoryResets.length} completed`, `${new Set(bestCategoryResets.map((reset) => dayKey(reset.completedAt))).size} active days`, "recency-weighted activity history"]));
  }

  const windows = WINDOWS.map((window) => {
    const attempts = observed.filter((reset) => windowFor(reset.completedAt ?? reset.scheduledFor) === window);
    const done = attempts.filter((reset) => reset.status === "completed");
    return { window, attempts, done, rate: attempts.length ? done.length / attempts.length : 0 };
  });
  const strongestWindow = [...windows].sort((a, b) => b.rate - a.rate || b.done.length - a.done.length)[0];
  if (strongestWindow && strongestWindow.done.length >= 3 && strongestWindow.attempts.length >= 4 && activeDays >= 3) {
    insights.push(insightFor("time-window", "time", `You usually complete resets in the ${strongestWindow.window}.`, strongestWindow.done, strongestWindow.rate, [`${strongestWindow.done.length} completed`, `${strongestWindow.attempts.length} attempts`, `${Math.round(strongestWindow.rate * 100)}% completion in this window`]));
  }

  const short = completed.filter((reset) => (getActivity(reset.activityId)?.durationSeconds ?? 0) <= 120);
  const long = observed.filter((reset) => (getActivity(reset.activityId)?.durationSeconds ?? 0) > 120);
  const shortAttempts = observed.filter((reset) => (getActivity(reset.activityId)?.durationSeconds ?? 0) <= 120);
  const shortRate = shortAttempts.length ? short.length / shortAttempts.length : 0;
  if (short.length >= 4 && shortAttempts.length >= 4 && shortRate >= 0.65 && activeDays >= 3) {
    insights.push(insightFor("duration", "duration", "Shorter resets are working more consistently for you.", short, shortRate, [`${short.length} short resets completed`, `${shortAttempts.length} short attempts`, `${long.length} longer attempts compared`]));
  }

  const contextGroups = [...new Set(completed.map((reset) => reset.locationContext).filter(Boolean))].map((context) => ({
    context: context!,
    values: completed.filter((reset) => reset.locationContext === context),
  }));
  const strongestContext = contextGroups.sort((a, b) => b.values.length - a.values.length)[0];
  if (strongestContext && strongestContext.values.length >= 3 && new Set(strongestContext.values.map((reset) => dayKey(reset.completedAt))).size >= 2) {
    const contextCategory = getActivity(strongestContext.values.at(-1)?.activityId)?.category ?? "movement";
    insights.push(insightFor("context", "activity", `You complete ${contextCategory} resets well when you're at ${strongestContext.context.replace("_", " ")}.`, strongestContext.values, 0.7, [`${strongestContext.values.length} completed in this context`, `${new Set(strongestContext.values.map((reset) => dayKey(reset.completedAt))).size} active days`, "saved context at reset start"]));
  }

  const grace = resets.filter((reset) => reset.graceUsed);
  const graceWindows = WINDOWS.map((window) => ({ window, values: grace.filter((reset) => windowFor(reset.scheduledFor) === window) })).sort((a, b) => b.values.length - a.values.length)[0];
  if (graceWindows && graceWindows.values.length >= 3 && new Set(graceWindows.values.map((reset) => dayKey(reset.scheduledFor))).size >= 2) {
    insights.push(insightFor("flexibility-window", "flexibility", `The ${graceWindows.window} may need a little more flexibility.`, graceWindows.values, 0.5, [`${graceWindows.values.length} grace events`, "repeated across multiple days"]));
  }

  const skipped = resets.filter((reset) => reset.status === "skipped");
  const repeatedSkip = [...new Map(skipped.map((reset) => [reset.activityId, skipped.filter((item) => item.activityId === reset.activityId)])).values()].sort((a, b) => b.length - a.length)[0];
  if (repeatedSkip && repeatedSkip.length >= 3) {
    insights.push(insightFor("repeated-skip", "avoidance", `${getActivity(repeatedSkip[0]?.activityId)?.name ?? "One activity"} is often postponed or skipped.`, repeatedSkip, 0.25, [`${repeatedSkip.length} skips`, "same activity"]));
  }

  const frictions = buildFriction(resets);
  for (const friction of frictions) {
    const id = `friction-${friction.context ?? "any"}-${friction.activityType ?? "any"}-${friction.timeWindow ?? "any"}`;
    insights.push(insightFor(id, "avoidance", "This combination often needs a lighter or later reset.", resets.filter((reset) => reset.locationContext === friction.context && windowFor(reset.scheduledFor) === friction.timeWindow), friction.score, [`${friction.evidenceCount} friction events`, `${friction.timeWindow ?? "varied time"}`, `${friction.durationRange ?? "varied duration"} activity`]));
  }

  const visibleInsights = insights.filter((insight) => !suppressedInsightIds.includes(insight.id));
  const recentDays = new Set(completed.filter((reset) => Date.now() - new Date(reset.completedAt ?? reset.scheduledFor).getTime() <= 7 * 86_400_000).map((reset) => dayKey(reset.completedAt)).filter(Boolean)).size;
  const priorDays = new Set(completed.filter((reset) => Date.now() - new Date(reset.completedAt ?? reset.scheduledFor).getTime() > 7 * 86_400_000).map((reset) => dayKey(reset.completedAt)).filter(Boolean)).size;
  const disruptionDetected = activeDays >= 5 && priorDays >= 3 && recentDays === 0;
  const preferredWindow = strongestWindow && strongestWindow.done.length >= 3 ? strongestWindow.window : null;
  const scheduleShiftMinutes = preferredWindow === "afternoon" ? 15 : preferredWindow === "morning" ? -10 : preferredWindow === "evening" ? 10 : 0;
  const averagePerDay = activeDays > 0 ? completed.length / activeDays : 0;
  const frequencyPerDay = Math.max(2, Math.min(5, Math.round(averagePerDay || 3)));
  const recommendationReasons: RecommendationReason[] = [];
  if (visibleInsights.some((insight) => insight.type === "duration")) recommendationReasons.push({ id: "duration-fit", label: "short resets have stronger completion evidence", weight: 0.8 });
  if (preferredWindow) recommendationReasons.push({ id: "time-fit", label: `${preferredWindow} completion history is stronger`, weight: 0.7 });
  if (frictions.length > 0) recommendationReasons.push({ id: "friction", label: "repeated delays are being avoided", weight: -0.6 });
  if (profile?.preferredActivityTypes.length) recommendationReasons.push({ id: "explicit-preference", label: "your stated preference is included", weight: 0.3 });

  const toughestPeriod = strongestWindow?.attempts.length ? title(strongestWindow.window) : "Not enough data yet";
  const rhythmScore = completed.length === 0 ? 0 : Math.round(completionRate * 0.6 + Math.min(activeDays * 5, 30) + Math.min(checkIns.length * 2, 10));

  const recommendationText = buildRecommendationText({
    learningStage,
    bestCategory,
    bestActivityName: preferredName,
    toughestPeriod,
    completionRate,
    insights: visibleInsights,
  });

  const patternSummary = visibleInsights[0]?.statement ?? (learningStage === "new" ? "MOVA is still learning your rhythm from your completed resets." : "MOVA is collecting more evidence before making a stronger pattern claim.");

  const signals = [
    ...(profile?.breakRhythm ? ["Break availability"] : []),
    ...(completed.length > 0 ? ["Completed resets"] : []),
    ...(observed.some((reset) => reset.status === "skipped") ? ["Skipped resets"] : []),
    ...(observed.some((reset) => reset.status === "rescheduled") ? ["Rescheduled resets"] : []),
    ...(checkIns.length > 0 ? ["Check-ins"] : []),
  ];

  return {
    bestCategory,
    bestActivityName: preferredName,
    toughestPeriod,
    rhythmScore,
    completionRate,
    recommendationText,
    patternSummary,
    signals,
    learningStage,
    meaningfulCompletions: completed.length,
    activeDays,
    insights: visibleInsights,
    frictions,
    recommendationReasons,
    preferredWindow,
    scheduleShiftMinutes,
    frequencyPerDay,
    disruptionDetected,
  };
}

export function buildBehaviorExplanation(summary: BehaviorSummary): string {
  if (summary.insights.length === 0) return "MOVA is still learning your rhythm. Keep completing resets and your patterns will start to take shape.";
  return `${summary.patternSummary} MOVA will keep checking that pattern against what you do next.`;
}

function buildRecommendationText(input: {
  learningStage: LearningStage;
  bestCategory: string;
  bestActivityName: string;
  toughestPeriod: string;
  completionRate: number;
  insights: BehavioralInsight[];
}): string {
  if (input.learningStage === "new") return "We're still learning your rhythm. Keep completing resets and MOVA will start recognizing what fits.";
  const categoryLabel = input.bestCategory.charAt(0).toUpperCase() + input.bestCategory.slice(1);
  const first = input.insights[0]?.statement ?? `We're starting to notice your rhythm around ${input.toughestPeriod.toLowerCase()}.`;
  return `${first} ${categoryLabel} resets are currently leading your recent history, so MOVA will favor ${input.bestActivityName.toLowerCase()} while continuing to explore.`;
}

export function rankActivitiesForBehavior(
  profile: MovaProfile,
  resets: Reset[],
  activities: ReturnType<typeof getActivity>[],
): ReturnType<typeof getActivity>[] {
  const candidates = activities.filter((activity): activity is NonNullable<ReturnType<typeof getActivity>> => activity !== null);
  const observed = resets.filter((reset) => ["completed", "skipped", "rescheduled"].includes(reset.status));
  if (observed.length < 5) return candidates;

  return [...candidates].sort((a, b) => score(b) - score(a));

  function score(activity: NonNullable<ReturnType<typeof getActivity>>): number {
    const relevant = observed.filter((reset) => reset.activityId === activity.id);
    const category = observed.filter((reset) => getActivity(reset.activityId)?.category === activity.category);
    const weightedRate = (values: Reset[]) => {
      const totalWeight = values.reduce((sum, reset) => sum + recencyWeight(reset), 0);
      const completedWeight = values.filter((reset) => reset.status === "completed").reduce((sum, reset) => sum + recencyWeight(reset), 0);
      return totalWeight > 0 ? completedWeight / totalWeight : 0;
    };
    const completion = weightedRate(relevant);
    const categoryCompletion = weightedRate(category);
    const shortAttempts = observed.filter((reset) => (getActivity(reset.activityId)?.durationSeconds ?? 0) <= 120);
    const longAttempts = observed.filter((reset) => (getActivity(reset.activityId)?.durationSeconds ?? 0) > 120);
    const shortPreference = weightedRate(shortAttempts) - weightedRate(longAttempts);
    const durationFit = activity.durationSeconds <= 120 ? Math.max(0, shortPreference) * 0.12 : Math.max(0, -shortPreference) * 0.04;
    const frictionPenalty = buildFriction(observed)
      .filter((friction) => friction.activityType === activity.category)
      .reduce((sum, friction) => sum + friction.score * 0.12, 0);
    const latestActivity = [...observed].sort((left, right) => new Date(right.completedAt ?? right.scheduledFor).getTime() - new Date(left.completedAt ?? left.scheduledFor).getTime())[0];
    const repetitionPenalty = latestActivity?.activityId === activity.id ? 0.16 : 0;
    const explicit = profile.preferredActivityTypes.includes(activity.category) ? 0.12 : 0;
    const exploration = relevant.length === 0 ? 0.08 : 0;
    return completion * 0.65 + categoryCompletion * 0.25 + durationFit + explicit + exploration - frictionPenalty - repetitionPenalty;
  }
}

export function adaptiveSlotMinutes(
  profile: MovaProfile,
  history: Reset[],
  baseMinutes: number[],
): number[] {
  const summary = buildBehaviorSummary(profile, history, []);
  if (summary.learningStage === "new" || summary.disruptionDetected) return baseMinutes;
  const shift = Math.max(-20, Math.min(20, summary.scheduleShiftMinutes));
  const minimumGap = 90;
  const maxPerDay = summary.frequencyPerDay;
  const shifted = baseMinutes.slice(0, maxPerDay).map((minute) => minute + shift);
  return shifted.filter((minute, index) => index === 0 || minute - shifted[index - 1]! >= minimumGap);
}
