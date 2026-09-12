import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Brain, Footprints, MapPin, ShieldCheck, ChevronDown, Clock, Play, Globe } from "lucide-react";
import { FrostCard, MovaScreen, Pill, PrimaryButton, QuietButton } from "@/components/mova/screen";
import { buildAnalyticsSummary } from "@/lib/analytics/analytics-engine";
import { getActivity } from "@/lib/mova-activities";
import { buildBehaviorSummary } from "@/lib/intelligence/behavior-engine";
import { useMova } from "@/lib/mova-store";
import { minutesUntil } from "@/lib/mova-types";
import type { LocationContext } from "@/lib/location/location-types";
import { describeLocationContext } from "@/lib/location/location-service";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "Today's reset | MOVA" },
      {
        name: "description",
        content:
          "Your MOVA home: next predicted reset, today's rhythm and the resets you've already taken.",
      },
      { property: "og:title", content: "Today's reset | MOVA" },
      {
        property: "og:description",
        content: "Let's make space for you today. Work. Reset. Return.",
      },
    ],
  }),
  component: HomeScreen,
});

const timeline = [
  { time: "8:00", label: "Work", tone: "work" },
  { time: "9:20", label: "Reset", tone: "done" },
  { time: "11:00", label: "Work", tone: "work" },
  { time: "12:15", label: "Reset", tone: "done" },
  { time: "2:00", label: "Upcoming reset", tone: "next" },
  { time: "4:30", label: "Reflection", tone: "work" },
] as const;

const DEMO_CONTEXTS: { value: LocationContext; label: string }[] = [
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "school", label: "School" },
  { value: "on_the_move", label: "On the move" },
];

function DemoControls() {
  const { demo, demoActive, demoReminders, setDemoContext, triggerNextDemoReset, resetDemo, exitDemoMode } = useMova();
  const [showContextPicker, setShowContextPicker] = useState(false);
  const [showDemoMenu, setShowDemoMenu] = useState(false);

  return (
    <div className="mt-5 space-y-3">
      {demoActive && (
        <div className="rounded-2xl bg-sagedeep/95 p-4 text-white shadow-lg shadow-sagedeep/25">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="size-4" />
              <span className="text-[12px] font-semibold">Demo Mode</span>
              <span className="text-[10px] text-white/70">· Jordan</span>
            </div>
            <button
              type="button"
              onClick={() => setShowDemoMenu(!showDemoMenu)}
              className="rounded-xl bg-white/15 p-1.5 text-white/80 transition-colors hover:bg-white/25"
            >
              <ChevronDown className="size-4" />
            </button>
          </div>
          {showDemoMenu && (
            <div className="mt-3 grid gap-2">
              <div className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-2">
                <span className="text-[11px] text-white/80">Context</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowContextPicker(!showContextPicker)}
                    className="flex items-center gap-1 rounded-lg bg-white/20 px-2 py-1 text-[10px] text-white transition-colors hover:bg-white/30"
                  >
                    {describeLocationContext(demo.readDemoContext().currentContext)}
                    <ChevronDown className="size-3" />
                  </button>
                  {showContextPicker && (
                    <div className="absolute z-10 mt-1 grid gap-1 rounded-xl bg-ink p-1 shadow-lg">
                      {DEMO_CONTEXTS.map((ctx) => (
                        <button
                          key={ctx.value}
                          type="button"
                          onClick={() => {
                            setDemoContext(ctx.value);
                            setShowContextPicker(false);
                          }}
                          className={`block w-full text-left px-2 py-1 text-[10px] text-white/80 transition-colors hover:bg-white/10 ${
                            demo.readDemoContext().currentContext === ctx.value ? "text-white font-medium" : ""
                          }`}
                        >
                          {ctx.label}
                          {demo.readDemoContext().currentContext === ctx.value && " · active"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={triggerNextDemoReset}
                className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-left text-[11px] text-white transition-colors hover:bg-white/20"
              >
                <Clock className="size-3.5" />
                Trigger next reset
              </button>
              <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-[11px] text-white/80">
                <Play className="size-3.5" />
                <span>Demo reminders: {demoReminders.length}</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetDemo}
                  className="flex-1 rounded-xl bg-white/10 py-2 text-[10px] font-medium text-white transition-colors hover:bg-white/20"
                >
                  Reset demo
                </button>
                <button
                  type="button"
                  onClick={exitDemoMode}
                  className="flex-1 rounded-xl bg-white/10 py-2 text-[10px] font-medium text-white transition-colors hover:bg-white/20"
                >
                  Exit demo mode
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {!demoActive && (
        <button
          type="button"
          onClick={() => {
            window.location.search = "?demo=1";
            window.location.reload();
          }}
          className="frost-2 rounded-2xl p-4 text-center text-[12px] font-medium text-sagedeep transition-colors hover:bg-sage/10"
        >
          <Play className="mx-auto size-4 mb-1" />
          Enter Demo Mode
        </button>
      )}
    </div>
  );
}

function HomeScreen() {
  const { state, profile, settings, onboarded, authReady, backend, syncStatus, syncError, displayName, resets, nextReset, demo, demoActive, startReset } = useMova();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authReady || syncStatus === "loading") return;
    if (!onboarded) navigate({ to: "/onboarding" });
  }, [authReady, syncStatus, onboarded, navigate]);

  // Keep these hooks above the loading/onboarding returns so their order never changes.
  const demoSnapshot = demoActive ? demo.readDemoContext() : null;
  const effectiveProfile = demoSnapshot?.profile ?? profile;
  const effectiveResets = demoSnapshot?.resets ?? resets;
  const effectiveCheckIns = demoSnapshot?.checkIns ?? state.checkIns;

  const effectiveNextReset = useMemo(() => {
    const sorted = [...effectiveResets].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
    return sorted.find((r) => r.status === "scheduled") ?? null;
  }, [effectiveResets]);

  const behavior = useMemo(() => {
    if (demoActive) return demo.demoBehavior();
    return buildBehaviorSummary(effectiveProfile, effectiveResets, effectiveCheckIns, settings?.suppressedInsightIds ?? []);
  }, [demoActive, demo, effectiveProfile, effectiveResets, effectiveCheckIns, settings?.suppressedInsightIds]);

  const analytics = useMemo(() => {
    if (demoActive) return demo.demoAnalytics();
    return buildAnalyticsSummary(effectiveResets, effectiveCheckIns);
  }, [demoActive, demo, effectiveResets, effectiveCheckIns]);

  if (!authReady || syncStatus === "loading") {
    return (
      <MovaScreen>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[13px] text-soft">Loading your space…</p>
        </div>
      </MovaScreen>
    );
  }

  if (!onboarded) {
    return (
      <MovaScreen>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[13px] text-soft">Taking you to onboarding…</p>
        </div>
      </MovaScreen>
    );
  }

  const p = effectiveProfile;
  const greeting = displayName && displayName !== "Guest" ? displayName : "there";
  const nextActivity = effectiveNextReset ? getActivity(effectiveNextReset.activityId) : null;
  const mins = effectiveNextReset ? minutesUntil(effectiveNextReset.scheduledFor) : null;
  const nextMins = mins !== null && mins >= 0 ? mins : null;

  const resetsDone = analytics.completedResets;
  const totalMovementMinutes = Math.round(analytics.totalMovementMinutes);
  const rhythmLabel = behavior.bestCategory === "walking" ? "Walk" : behavior.bestCategory === "breathing" ? "Breath" : behavior.bestCategory === "stretch" ? "Stretch" : "Movement";
  const demoContextLabel = demoActive ? describeLocationContext(demo.readDemoContext().currentContext) : null;

  return (
    <MovaScreen>
      {syncStatus === "error" && (
        <p className="mb-3 text-center text-[11px] font-medium text-soft">
          Offline mode — changes saved on this device{syncError ? ` (${syncError})` : ""}.
        </p>
      )}
      {backend === "local" && syncStatus === "idle" && (
        <p className="mb-3 text-center text-[11px] font-medium text-soft">
          Demo mode — add Firebase env vars to sync across devices.
        </p>
      )}
      {p && (
        <p className="mb-3 text-center text-[11px] font-medium text-soft">
          Tuned for {p.occupation || "your work"}{p.breakRhythm ? ` · ${p.breakRhythm}` : ""}.
        </p>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="frost grid size-11 place-items-center rounded-2xl">
            <span className="animate-breathe size-4 rounded-full bg-gradient-to-br from-sage to-sky" />
          </div>
          <div>
            <p className="text-[15px] font-extrabold tracking-[0.32em] text-ink">MOVA</p>
            <p className="text-[10px] font-medium tracking-[0.2em] text-soft uppercase">
              wellness rhythm
            </p>
          </div>
        </div>
        <Link to="/profile" className="frost-2 grid size-11 place-items-center rounded-2xl">
          <span className="text-sm font-semibold text-sagedeep">
            {greeting.slice(0, 2).toUpperCase()}
          </span>
        </Link>
      </div>

      <div className="animate-rise mt-7">
        <p className="text-[11px] font-semibold tracking-[0.24em] text-sagedeep uppercase">
          {demoActive ? "Today" : "Good " + (new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening")}
        </p>
        <h1 className="mt-1 font-display text-[30px] leading-[1.05] font-semibold text-ink">
          {greeting}, {demoActive ? "let's see how MOVA responds." : "let's make space for you."}
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-soft">
          {demoActive
            ? "Your next reset is ready. MOVA adapts to your context and history."
            : nextMins !== null && nextMins < 60
              ? "Your MOVA reset is due soon."
              : "Pause before you break. Small pauses, better days."}
        </p>
      </div>

      <FrostCard className="mt-6 p-5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-soft uppercase">
            {demoActive ? "Recommended now" : "Today's reset"}
          </p>
          <span className="rounded-full bg-sage/15 px-2.5 py-1 text-[10px] font-semibold text-sagedeep">
            {demoActive ? "Demo" : "AI scheduled"}
          </span>
        </div>
        <div className="mt-4 flex items-center gap-5">
          <div className="relative grid size-24 shrink-0 place-items-center">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-sage/25 to-sky/25" />
            <div className="animate-breathe absolute inset-1.5 rounded-full bg-white/50" />
            <div className="relative text-center">
              <p className="font-display text-[26px] leading-none font-bold text-ink">
                {nextActivity ? (getActivity(nextActivity.id)?.durationSeconds ?? 2280) / 60 : 38}
              </p>
              <p className="text-[9px] font-semibold tracking-[0.15em] text-soft uppercase">
                min
              </p>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[16px] font-semibold text-ink">
              {nextActivity?.name ?? "Shoulder + breathing reset"}
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-soft">
              {behavior.scheduleShiftMinutes !== 0
                ? "MOVA adjusted this break based on your recent rhythm."
                : demoActive
                ? "This reset adapts to your demo context and history."
                : nextMins !== null && nextMins < 60
                  ? "Time to step away for a moment."
                  : "Your next reset is based on your work pattern and previous activity."}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Pill>Movement</Pill>
              <Pill>Breathing</Pill>
              <Pill>Eye</Pill>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            if (!effectiveNextReset) return;
            const isCamera = effectiveNextReset.verificationMethod === "camera";
            const isDistance = effectiveNextReset.verificationMethod === "distance";
            
            if (demoActive) {
              demo.startDemoReset(effectiveNextReset.id);
            } else {
              await startReset(effectiveNextReset.id);
            }
            
            navigate({ to: isCamera ? "/scan" : isDistance ? "/walk" : "/reset" });
          }}
          className="mt-4 block w-full rounded-2xl bg-sagedeep/95 px-5 py-3.5 text-center text-[14px] font-semibold text-white shadow-lg shadow-sagedeep/25 transition-all hover:bg-sagedeep active:scale-[0.99]"
        >
          {demoActive ? "Start reset" : "Start my reset moment"}
        </button>
        {behavior.recommendationReasons.length > 0 && (
          <div className="mt-3 rounded-2xl bg-mist/65 px-3.5 py-3">
            <p className="text-[10px] font-semibold tracking-[0.18em] text-sagedeep uppercase">Why this one?</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-soft">
              {behavior.recommendationReasons.slice(0, 2).map((reason) => reason.label).join(" · ")}
            </p>
          </div>
        )}
      </FrostCard>

      {/* Demo controls */}
      <DemoControls />

      <div className="mt-5 grid grid-cols-3 gap-3">
        <FrostCard soft className="p-3">
          <p className="font-display text-[20px] font-bold text-ink">{resetsDone}</p>
          <p className="text-[10px] leading-tight font-medium text-soft">resets taken</p>
        </FrostCard>
        <FrostCard soft className="p-3">
          <p className="font-display text-[20px] font-bold text-ink">{totalMovementMinutes}m</p>
          <p className="text-[10px] leading-tight font-medium text-soft">moved</p>
        </FrostCard>
        <FrostCard soft className="p-3">
          <p className="font-display text-[20px] font-bold text-ink">{rhythmLabel}</p>
          <p className="text-[10px] leading-tight font-medium text-soft">strongest</p>
        </FrostCard>
      </div>

      <FrostCard className="mt-5 p-5">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-soft uppercase">
          Your day
        </p>
        <div className="mt-4 flex items-center gap-1.5">
          <div className="h-1.5 flex-1 rounded-full bg-mist" />
          <div className="h-1.5 w-1/4 rounded-full bg-gradient-to-r from-sage to-sky" />
          <div className="h-1.5 w-1/3 rounded-full bg-mist" />
          <div className="h-1.5 w-1/5 rounded-full bg-gradient-to-r from-sage to-sky" />
          <div className="h-1.5 flex-1 rounded-full bg-mist" />
        </div>
        <div className="mt-3 flex justify-between text-[9px] font-medium tracking-wider text-soft uppercase">
          <span>8:00</span>
          <span>12:00</span>
          <span>16:00</span>
        </div>
        <div className="mt-4 space-y-2.5">
          {timeline.map((t) => (
            <div key={t.time + t.label} className="flex items-center gap-3">
              <span
                className={`size-2 rounded-full ${
                  t.tone === "done"
                    ? "bg-sage"
                    : t.tone === "next"
                      ? "border border-sky bg-white/70"
                      : "bg-mist"
                }`}
              />
              <span className="text-[12px] font-medium text-ink">{t.time}</span>
              <span className="text-[12px] text-soft">{t.label}</span>
              {t.tone === "done" && (
                <span className="ml-auto text-[11px] font-semibold text-sagedeep">✓</span>
              )}
              {t.tone === "next" && (
                <span className="ml-auto text-[11px] font-medium text-soft">soon</span>
              )}
            </div>
          ))}
        </div>
      </FrostCard>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Link to="/walk" className="frost-2 rounded-2xl p-4">
          <Footprints className="size-4 text-sagedeep" strokeWidth={1.75} />
          <p className="mt-2 text-[13px] font-semibold text-ink">Walk demo</p>
          <p className="text-[11px] text-soft">Miles + place</p>
        </Link>
        <Link to="/places" className="frost-2 rounded-2xl p-4">
          <MapPin className="size-4 text-sagedeep" strokeWidth={1.75} />
          <p className="mt-2 text-[13px] font-semibold text-ink">My places</p>
          <p className="text-[11px] text-soft">Home · Work · School</p>
        </Link>
        <Link to="/library" className="frost-2 rounded-2xl p-4">
          <BookOpen className="size-4 text-sagedeep" strokeWidth={1.75} />
          <p className="mt-2 text-[13px] font-semibold text-ink">Reset Library</p>
          <p className="text-[11px] text-soft">Filtered for your work</p>
        </Link>
        <Link to="/learning" className="frost-2 rounded-2xl p-4">
          <Brain className="size-4 text-sagedeep" strokeWidth={1.75} />
          <p className="mt-2 text-[13px] font-semibold text-ink">AI rhythm</p>
          <p className="text-[11px] text-soft">What MOVA learned</p>
        </Link>
      </div>

      <Link
        to="/privacy"
        className="mt-5 flex items-center gap-3 rounded-2xl bg-sagedeep/90 px-4 py-3.5 text-white shadow-lg shadow-sagedeep/30"
      >
        <span className="grid size-8 place-items-center rounded-xl bg-white/15">
          <ShieldCheck className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="text-[12px] font-semibold">Work. Reset. Return.</p>
          <p className="text-[11px] text-white/70">
            AI adapts timing to your live workload — you stay in control.
          </p>
        </div>
      </Link>
    </MovaScreen>
  );
}
