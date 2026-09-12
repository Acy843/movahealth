import { createFileRoute } from "@tanstack/react-router";
import { Gift, Sparkles } from "lucide-react";
import { FrostCard, MovaScreen, ScreenHeader } from "@/components/mova/screen";
import { buildAnalyticsSummary } from "@/lib/analytics/analytics-engine";
import { buildBehaviorSummary } from "@/lib/intelligence/behavior-engine";
import { useMova } from "@/lib/mova-store";

export const Route = createFileRoute("/insights")({
  head: () => ({
    meta: [
      { title: "Your Reset Insights | MOVA" },
      {
        name: "description",
        content:
          "See your real reset history, movement minutes, streaks and progress toward milestones.",
      },
      { property: "og:title", content: "Your Reset Insights | MOVA" },
      { property: "og:description", content: "Real movement progress, not demo numbers." },
    ],
  }),
  component: Insights,
});

function Insights() {
  const { resets, state, profile, settings, dismissInsight } = useMova();
  const summary = buildAnalyticsSummary(resets, state.checkIns);
  const behavior = buildBehaviorSummary(profile, resets, state.checkIns, settings?.suppressedInsightIds ?? []);
  const distanceKm = summary.totalWalkingDistanceMeters / 1000;
  const unlockedRewards = summary.rewards.filter((reward) => reward.unlocked);

  const weekData = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const count = resets.filter(
      (reset) =>
        reset.status === "completed" &&
        reset.completedAt &&
        `${new Date(reset.completedAt).getFullYear()}-${String(new Date(reset.completedAt).getMonth() + 1).padStart(2, "0")}-${String(new Date(reset.completedAt).getDate()).padStart(2, "0")}` === dayKey,
    ).length;
    return {
      day: date.toLocaleDateString([], { weekday: "short" }).slice(0, 3),
      value: count,
    };
  });

  const topActivity = summary.activityBreakdown.find((entry) => entry.completed > 0);

  return (
    <MovaScreen>
      <ScreenHeader
        eyebrow="Insights"
        title="Your Reset Insights"
        subtitle="Real movement trends from your actual reset history."
      />

      <div className="mt-6 grid grid-cols-2 gap-3">
        <FrostCard soft className="p-3">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-soft uppercase">Today</p>
          <p className="mt-2 font-display text-[22px] font-bold text-ink">
            {resets.filter((reset) => reset.status === "completed" && reset.completedAt && new Date(reset.completedAt).toDateString() === new Date().toDateString()).length}
          </p>
          <p className="text-[10px] text-soft">completed resets</p>
        </FrostCard>

        <FrostCard soft className="p-3">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-soft uppercase">This week</p>
          <p className="mt-2 font-display text-[22px] font-bold text-ink">{Math.round(summary.totalMovementMinutes)}</p>
          <p className="text-[10px] text-soft">movement minutes</p>
        </FrostCard>

        <FrostCard soft className="p-3">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-soft uppercase">Streak</p>
          <p className="mt-2 font-display text-[22px] font-bold text-ink">{summary.currentStreak}</p>
          <p className="text-[10px] text-soft">consecutive days</p>
        </FrostCard>

        <FrostCard soft className="p-3">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-soft uppercase">Distance</p>
          <p className="mt-2 font-display text-[22px] font-bold text-ink">{distanceKm.toFixed(distanceKm >= 10 ? 0 : 1)}km</p>
          <p className="text-[10px] text-soft">walking total</p>
        </FrostCard>
      </div>

      <FrostCard className="mt-4 p-5">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-soft uppercase">
          Best pattern
        </p>
        <p className="mt-1.5 font-display text-[24px] font-semibold text-ink">
          {topActivity ? topActivity.activityName : "No activity yet"}
        </p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-soft">
          {topActivity
            ? `${topActivity.completed} completed • ${topActivity.completionRate}% completion rate`
            : "Your movement story starts here."}
        </p>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-mist">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sage to-sky"
            style={{ width: `${summary.completionRate}%` }}
          />
        </div>
      </FrostCard>

      <div className="mt-4 grid gap-4">
        <FrostCard soft className="p-5">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-soft uppercase">
            Activity breakdown
          </p>
          <div className="mt-3 space-y-3">
            {summary.activityBreakdown.slice(0, 3).map((entry) => (
              <div key={entry.activityId}>
                <div className="mb-1 flex items-center justify-between text-[12px] text-ink">
                  <span>{entry.activityName}</span>
                  <span>{entry.completionRate}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-mist">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sage to-sky"
                    style={{ width: `${entry.completionRate}%` }}
                  />
                </div>
              </div>
            ))}
            {summary.activityBreakdown.length === 0 && (
              <p className="text-[12.5px] text-soft">No completed activity yet.</p>
            )}
          </div>
        </FrostCard>

        <FrostCard soft className="p-5">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-soft uppercase">
            Rewards
          </p>
          <div className="mt-3 space-y-2">
            {summary.rewards.slice(0, 3).map((reward) => (
              <div key={reward.id} className="flex items-center justify-between rounded-2xl bg-white/60 px-2.5 py-2">
                <div>
                  <p className="text-[12px] font-semibold text-ink">{reward.name}</p>
                  <p className="text-[10.5px] text-soft">{reward.progress}/{reward.total}</p>
                </div>
                <span className={`grid size-8 place-items-center rounded-xl ${reward.unlocked ? "bg-sage/18 text-sagedeep" : "bg-mist text-soft"}`}>
                  {reward.icon}
                </span>
              </div>
            ))}
            {unlockedRewards.length === 0 && (
              <p className="text-[12.5px] text-soft">No rewards unlocked yet — your first reset is the first milestone.</p>
            )}
          </div>
        </FrostCard>
      </div>

      <FrostCard className="mt-4 p-5">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-soft uppercase">
          This week
        </p>
        <div className="mt-5 flex items-end justify-between gap-2">
          {weekData.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex h-24 w-full items-end justify-center">
                <div
                  className="w-[10px] rounded-t-full bg-gradient-to-t from-sage to-sky"
                  style={{ height: `${Math.max(8, (d.value / Math.max(1, Math.max(...weekData.map((item) => item.value))) * 100))}%` }}
                />
              </div>
              <span className="text-[10px] font-medium text-soft">{d.day}</span>
            </div>
          ))}
        </div>
      </FrostCard>

      <div className="mt-4 rounded-[26px] bg-sagedeep/92 p-5 text-white shadow-lg shadow-sagedeep/25">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4" strokeWidth={1.75} />
          <p className="text-[11px] font-semibold tracking-[0.2em] uppercase">What MOVA knows</p>
        </div>
        <p className="mt-2.5 text-[13.5px] leading-relaxed text-white/90">
          {behavior.insights.length > 0
            ? behavior.insights[0]!.statement
            : "We're still learning your rhythm. Complete a few resets and MOVA will start recognizing your patterns."}
        </p>
      </div>

      {behavior.insights.length > 0 && (
        <div className="mt-4 space-y-2">
          {behavior.insights.slice(0, 3).map((insight) => (
            <div key={insight.id} className="flex items-center justify-between rounded-2xl bg-mist/70 px-3 py-2 text-[11px] text-soft">
              <span>{insight.statement}</span>
              <button type="button" onClick={() => void dismissInsight(insight.id)} className="ml-3 shrink-0 font-semibold text-sagedeep">Forget</button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-sagedeep/8 px-3 py-2 text-[12px] text-soft">
        <Gift className="size-4 text-sagedeep" strokeWidth={1.75} />
        <span>{unlockedRewards.length} reward{unlockedRewards.length === 1 ? "" : "s"} unlocked</span>
      </div>
    </MovaScreen>
  );
}
