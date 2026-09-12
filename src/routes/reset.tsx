import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MovaCanvas } from "@/components/mova/screen";
import { useMova } from "@/lib/mova-store";
import { getActivity, displayDuration } from "@/lib/mova-activities";

export const Route = createFileRoute("/reset")({
  head: () => ({
    meta: [
      { title: "MOVA time — reset | MOVA" },
      {
        name: "description",
        content: "A guided reset timed by AI for a moment that fits your shift.",
      },
      { property: "og:title", content: "MOVA time — reset" },
    ],
  }),
  component: ResetAlert,
});

function ResetAlert() {
  const navigate = useNavigate();
  const { currentReset, nextReset, requestGrace, demoActive, demo } = useMova();
  
  // Grace target: the current intervention reset (demo mode reads the isolated demo context).
  const demoTarget = demoActive
    ? demo.readDemoContext().resets.find((r) => r.status === "active" || (r.status === "scheduled" && new Date(r.scheduledFor).getTime() <= Date.now())) ?? null
    : null;
  const graceTarget = demoActive ? demoTarget : currentReset ?? nextReset;
  
  const activity = graceTarget ? getActivity(graceTarget.activityId) : null;
  const initialSeconds = activity?.durationSeconds ?? 10;

  const [seconds, setSeconds] = useState(initialSeconds);
  const [phase, setPhase] = useState<"in" | "out">("in");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(t);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const p = setInterval(() => setPhase((v) => (v === "in" ? "out" : "in")), 3000);
    return () => clearInterval(p);
  }, []);

  useEffect(() => {
    if (seconds !== 0) return undefined;
    const t = setTimeout(() => navigate({ to: "/verify" }), 900);
    return () => clearTimeout(t);
  }, [seconds, navigate]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  const graceUsable = graceTarget !== null && (graceTarget.status === "scheduled" || graceTarget.status === "active") && !graceTarget.graceUsed;

  // One 10-minute grace period per reset (demo: accelerated 15s), persisted on
  // the reset record — not a frontend timer.
  const takeBreak = async () => {
    if (!graceTarget) return;
    setBusy(true);
    try {
      if (demoActive) demo.activateDemoGrace(graceTarget.id);
      else await requestGrace(graceTarget.id);
      navigate({ to: "/home" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <MovaCanvas tone="focus">
      <div className="relative mx-auto flex min-h-[100dvh] max-w-[420px] flex-col items-center px-6 pt-14 pb-10 text-center">
        <p className="text-[11px] font-semibold tracking-[0.26em] text-sagedeep uppercase">
          MOVA time
        </p>
        <h1 className="animate-rise mt-3 font-display text-[26px] leading-tight font-semibold text-ink">
          You don't need a long break.
        </h1>
        <p className="mt-2 max-w-[28ch] text-[13.5px] leading-relaxed text-soft">
          You need a moment.
        </p>

        <div className="frost mt-7 w-full rounded-[26px] p-5 text-left">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-sagedeep uppercase">
            {activity ? displayDuration(initialSeconds) : "60-second"} reset
          </p>
          <p className="mt-1.5 text-[16px] font-semibold text-ink">
            {activity?.name ?? "Shoulder + breathing reset"}
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-soft">
            {activity?.instructions ?? "Sit or stand comfortably. Roll your shoulders slowly while following the breathing guide."}
          </p>
        </div>

        <div className="relative mt-10 grid size-[248px] place-items-center">
          <div className="absolute inset-0 rounded-full bg-sage/10" />
          <div className="absolute inset-6 rounded-full bg-sage/15" />
          <div
            className="absolute inset-10 rounded-full bg-gradient-to-br from-sage/35 to-sky/30 transition-transform duration-[3000ms] ease-in-out"
            style={{ transform: phase === "in" ? "scale(1.12)" : "scale(0.86)" }}
          />
          <div className="frost absolute inset-[74px] rounded-full" />
          <div className="relative z-10 text-center">
            <p className="text-[12px] font-semibold tracking-[0.18em] text-sagedeep uppercase">
              {phase === "in" ? "Breathe in" : "Breathe out"}
            </p>
            <p className="mt-1 font-display text-[46px] leading-none font-semibold text-ink">
              {mm}:{ss}
            </p>
          </div>
        </div>

        <p className="mt-8 text-[13px] font-medium tracking-wide text-soft">
          {seconds === 0 ? "Reset complete" : "Resetting…"}
        </p>

        <div className="mt-auto w-full space-y-3 pt-10">
          {graceUsable && (
            <button
              type="button"
              onClick={takeBreak}
              disabled={busy}
              className="frost-2 block w-full rounded-2xl px-5 py-3.5 text-center text-[14px] font-medium text-soft disabled:opacity-55"
            >
              {busy ? "Taking a short break…" : "I can't take the break right now"}
            </button>
          )}
        </div>
      </div>
    </MovaCanvas>
  );
}
