import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { FrostCard, MovaScreen, ScreenHeader } from "@/components/mova/screen";
import { buildBehaviorSummary, buildBehaviorExplanation } from "@/lib/intelligence/behavior-engine";
import { useMova } from "@/lib/mova-store";

export const Route = createFileRoute("/learning")({
  head: () => ({
    meta: [
      { title: "Your reset pattern | MOVA" },
      {
        name: "description",
        content:
          "How MOVA uses your reset history and check-ins to suggest the right rhythm for your day.",
      },
      { property: "og:title", content: "Your reset pattern | MOVA" },
      {
        property: "og:description",
        content: "MOVA is not a timer — it adapts to your shift, your limits and your feedback.",
      },
    ],
  }),
  component: Learning,
});

function Learning() {
  const { state, profile, settings, resets, dismissInsight } = useMova();
  const summary = buildBehaviorSummary(profile, resets, state.checkIns, settings?.suppressedInsightIds ?? []);
  const learningTitle = summary.learningStage === "new"
    ? "We're still learning your rhythm."
    : summary.learningStage === "observing"
      ? "We're starting to notice your rhythm."
      : summary.learningStage === "early-patterns"
        ? "Your rhythm is beginning to take shape."
        : "Your rhythm is becoming clearer.";

  return (
    <MovaScreen>
      <ScreenHeader
        eyebrow="Personalization"
        title="Your reset pattern"
        subtitle="Your schedule is grounded in actual reset history and check-ins."
      />

      <FrostCard className="mt-6 p-5">
        <p className="font-display text-[23px] font-semibold leading-tight text-ink">{learningTitle}</p>
        <p className="mt-2 text-[13px] leading-relaxed text-soft">
          {summary.learningStage === "new"
            ? "MOVA is watching how you move, when you take breaks, what you complete, and what you postpone. Keep using MOVA and your personal rhythm will start to take shape."
            : `${summary.meaningfulCompletions} completed resets across ${summary.activeDays} active days are helping MOVA recognize what fits.`}
        </p>
        {summary.insights.length > 0 && (
          <div className="mt-5 space-y-2.5">
            {summary.insights.map((insight) => (
              <div key={insight.id} className="rounded-2xl bg-mist/65 px-3.5 py-3">
                <p className="text-[13px] font-medium leading-relaxed text-ink">{insight.statement}</p>
                <p className="mt-1 text-[10.5px] text-soft">Observed across {insight.evidenceCount} resets.</p>
                <button type="button" onClick={() => void dismissInsight(insight.id)} className="mt-2 text-[10.5px] font-semibold text-sagedeep">That's not right</button>
              </div>
            ))}
          </div>
        )}
        {summary.insights.length === 0 && (
          <p className="mt-4 text-[12px] font-medium text-sagedeep">Not enough data yet. Complete a few more resets to reveal patterns.</p>
        )}
      </FrostCard>

      <div className="mt-5 rounded-[26px] bg-sagedeep/92 p-5 text-white shadow-lg shadow-sagedeep/25">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4" strokeWidth={1.75} />
          <p className="text-[11px] font-semibold tracking-[0.2em] uppercase">
            Recommendation
          </p>
        </div>
        <p className="mt-2.5 text-[13.5px] leading-relaxed text-white/90">
          {summary.recommendationText}
        </p>
      </div>

      <FrostCard soft className="mt-5 p-5">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-soft uppercase">
          What MOVA considers
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {summary.signals.map((s) => (
            <span
              key={s}
              className="rounded-full bg-white/70 px-2.5 py-1 text-[10.5px] font-medium text-sagedeep"
            >
              {s}
            </span>
          ))}
        </div>
        <div className="mt-4 space-y-1.5 text-[12.5px] leading-relaxed text-soft">
          <p>
            <span className="font-semibold text-ink">When</span> a reset is worth suggesting, based on observed timing
          </p>
          <p>
            <span className="font-semibold text-ink">What</span> kind of reset suits the moment, based on completion history
          </p>
          <p>
            <span className="font-semibold text-ink">How</span> lightly it should be verified, based on the activity
          </p>
        </div>
      </FrostCard>

      <FrostCard soft className="mt-5 p-5">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-soft uppercase">
          Later today
        </p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink">
          {buildBehaviorExplanation(summary)}
        </p>
      </FrostCard>

      <Link
        to="/home"
        className="mt-6 block w-full rounded-2xl bg-sagedeep/95 px-5 py-4 text-center text-[15px] font-semibold text-white shadow-lg shadow-sagedeep/25"
      >
        Sounds good
      </Link>
    </MovaScreen>
  );
}
