import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { CheckCircle2, Clock3, ShieldCheck } from "lucide-react";
import { displayDuration, getActivity } from "@/lib/mova-activities";
import { createReminder, triggerBrowserReminder } from "@/lib/notifications/notification-service";
import { checkGraceStatus, getGraceRemainingMs } from "@/lib/mova-service";
import { useMova } from "@/lib/mova-store";
import type { Reset } from "@/lib/mova-types";

const REAL_ESCALATION_MS: readonly [number, number] = [15 * 60_000, 30 * 60_000];
const DEMO_ESCALATION_MS: readonly [number, number] = [5_000, 10_000];

function isDue(reset: Reset): boolean {
  return reset.status === "scheduled" && new Date(reset.scheduledFor).getTime() <= Date.now();
}

// A reset inside its persisted grace window does not trigger the intervention.
function interventionTarget(reset: Reset): boolean {
  return (reset.status === "active" || isDue(reset)) && checkGraceStatus(reset) !== "in_grace";
}

export function PersistentIntervention() {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const {
    currentReset,
    resets,
    settings,
    startReset,
    completeReset,
    verifyReset,
    requestGrace,
    demo,
    demoActive,
  } = useMova();
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const notified = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const demoContext = demoActive ? demo.readDemoContext() : null;
  const demoReset = demoContext?.resets.find(interventionTarget) ?? null;
  const dueReset = demoActive
    ? demoReset
    : currentReset && interventionTarget(currentReset)
      ? currentReset
      : resets.find(interventionTarget) ?? null;
  const reset = dueReset;
  const activity = reset ? getActivity(reset.activityId) : null;
  const verificationRoute = path === "/scan" || path === "/walk";

  // 10-minute grace window (demo: accelerated 15s), derived from the persisted
  // graceUntil timestamp — never from component state.
  const grace = reset ? checkGraceStatus(reset) : "active";
  const inGrace = grace === "in_grace";
  const graceSecondsLeft = reset ? Math.ceil(getGraceRemainingMs(reset) / 1000) : 0;
  const graceCountdown = `${String(Math.floor(graceSecondsLeft / 60)).padStart(2, "0")}:${String(graceSecondsLeft % 60).padStart(2, "0")}`;
  const graceAvailable = reset !== null && (reset.status === "scheduled" || reset.status === "active") && !reset.graceUsed;

  useEffect(() => {
    if (!reset || reset.status === "completed" || notified.current === reset.id) return;
    notified.current = reset.id;
    if (settings?.notificationsEnabled === false) return;
    const reminder = createReminder(
      reset.id,
      reset.scheduledFor,
      "MOVA - Time to move.",
      `${activity?.name ?? "Your movement reset"} is due. Open MOVA to get it done.`,
    );
    triggerBrowserReminder({ ...reminder, status: "triggered", triggeredAt: new Date().toISOString() });
  }, [activity?.name, reset, settings?.notificationsEnabled]);

  useEffect(() => {
    if (!reset || reset.status !== "active") {
      setStartedAt(null);
      return;
    }
    setStartedAt(reset.startedAt);
  }, [reset?.id, reset?.status, reset?.startedAt]);

  if (!reset || reset.status === "completed" || verificationRoute) return null;

  const escalation = demoActive ? DEMO_ESCALATION_MS : REAL_ESCALATION_MS;
  const dueTime = new Date(reset.scheduledFor).getTime();
  const elapsed = Math.max(0, Date.now() - dueTime);
  const escalated = reset.status === "active" || elapsed >= escalation[0];
  const persistent = reset.status === "active" || elapsed >= escalation[1];
  const duration = activity?.durationSeconds ?? 60;
  const demoDuration = demoActive ? Math.min(duration, 8) : duration;
  const activeElapsed = reset.status === "active" && startedAt ? Math.max(0, Date.now() - new Date(startedAt).getTime()) : 0;
  const remaining = Math.max(0, Math.ceil((demoDuration * 1000 - activeElapsed) / 1000));
  const readyToComplete = remaining === 0;

  const begin = async () => {
    setBusy(true);
    try {
      if (demoActive) {
        demo.startDemoReset(reset.id);
        setTick((value) => value + 1);
      } else {
        await startReset(reset.id);
      }
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      if (demoActive) {
        demo.verifyDemoReset(reset.id, reset.verificationMethod, "Activity completed and verified.");
        demo.completeDemoReset(reset.id);
        setTick((value) => value + 1);
      } else {
        await verifyReset(reset.id, {
          status: "verified",
          method: reset.verificationMethod,
          message: "Activity completed and verified.",
        });
        await completeReset(reset.id);
      }
    } finally {
      setBusy(false);
    }
  };

  const openVerification = async () => {
    await begin();
    navigate({ to: reset.verificationMethod === "camera" ? "/scan" : "/walk" });
  };

  const takeGrace = async () => {
    setBusy(true);
    try {
      if (demoActive) {
        demo.activateDemoGrace(reset.id);
        setTick((value) => value + 1);
      } else {
        await requestGrace(reset.id);
      }
    } finally {
      setBusy(false);
    }
  };

  // During the grace window the intervention is hidden; only a light countdown
  // pill remains. It returns automatically once graceUntil passes.
  if (inGrace) {
    return (
      <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
        <div className="frost flex items-center gap-2 rounded-full px-4 py-2.5 shadow-lg" aria-live="polite">
          <Clock3 className="size-3.5 shrink-0 text-sagedeep" />
          <p className="text-[12px] font-medium text-soft">
            Break delayed · returns in <span className="font-semibold text-ink">{graceCountdown}</span>
            {demoActive ? " · demo: 15s (real: 10 min)" : ""}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/55 p-4 backdrop-blur-sm">
      <div className="mx-auto flex min-h-full max-w-[420px] items-center py-8">
        <section className="w-full rounded-[30px] bg-white p-6 shadow-2xl" aria-live="assertive">
          <div className="flex items-center gap-2 text-sagedeep">
            {reset.status === "active" ? <ShieldCheck className="size-5" /> : <Clock3 className="size-5" />}
            <p className="text-[11px] font-semibold tracking-[0.22em] uppercase">
              {reset.status === "active" ? "Reset in progress" : persistent ? "Your reset is still incomplete" : escalated ? "Your movement reset is waiting" : "Time to move"}
            </p>
          </div>
          <h2 className="mt-4 font-display text-[30px] leading-tight font-semibold text-ink">
            {reset.status === "active" ? "Let's get this done." : "Your body needs a reset."}
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-soft">
            {reset.status === "active" ? "Complete this activity to finish your movement break." : "Your movement break is due. MOVA will stay with you until it is complete."}
          </p>

          <div className="mt-6 rounded-[24px] bg-mist/70 p-5">
            <p className="text-[10px] font-semibold tracking-[0.2em] text-sagedeep uppercase">{demoActive ? "Demo reset" : "Scheduled reset"}</p>
            <p className="mt-2 text-[19px] font-semibold text-ink">{activity?.name ?? "Movement reset"}</p>
            <p className="mt-1 text-[12px] text-soft">{displayDuration(duration)} · {activity?.description ?? "A short movement break."}</p>
            {reset.status === "active" && (
              <>
                <p className="mt-4 text-[12.5px] leading-relaxed text-ink">{activity?.instructions}</p>
                <p className="mt-4 text-center font-display text-[34px] font-semibold text-sagedeep">
                  {remaining > 0 ? `${remaining}s` : "Ready"}
                </p>
              </>
            )}
          </div>

          <div className="mt-5">
            {reset.status === "scheduled" && reset.verificationMethod === "camera" && (
              <button type="button" onClick={openVerification} disabled={busy} className="w-full rounded-2xl bg-sagedeep/95 px-5 py-4 text-[15px] font-semibold text-white shadow-lg shadow-sagedeep/25 disabled:opacity-55">
                Start now - open camera
              </button>
            )}
            {reset.status === "scheduled" && reset.verificationMethod === "distance" && (
              <button type="button" onClick={openVerification} disabled={busy} className="w-full rounded-2xl bg-sagedeep/95 px-5 py-4 text-[15px] font-semibold text-white shadow-lg shadow-sagedeep/25 disabled:opacity-55">
                Start now - begin walking
              </button>
            )}
            {reset.status === "scheduled" && reset.verificationMethod !== "camera" && reset.verificationMethod !== "distance" && (
              <button type="button" onClick={begin} disabled={busy} className="w-full rounded-2xl bg-sagedeep/95 px-5 py-4 text-[15px] font-semibold text-white shadow-lg shadow-sagedeep/25 disabled:opacity-55">
                Start now
              </button>
            )}
            {reset.status === "active" && reset.verificationMethod === "camera" && (
              <button type="button" onClick={() => navigate({ to: "/scan" })} className="w-full rounded-2xl bg-sagedeep/95 px-5 py-4 text-[15px] font-semibold text-white shadow-lg shadow-sagedeep/25">
                Continue camera verification
              </button>
            )}
            {reset.status === "active" && reset.verificationMethod === "distance" && (
              <button type="button" onClick={() => navigate({ to: "/walk" })} className="w-full rounded-2xl bg-sagedeep/95 px-5 py-4 text-[15px] font-semibold text-white shadow-lg shadow-sagedeep/25">
                Continue walking verification
              </button>
            )}
            {reset.status === "active" && reset.verificationMethod !== "camera" && reset.verificationMethod !== "distance" && (
              <button type="button" onClick={finish} disabled={!readyToComplete || busy} className="w-full rounded-2xl bg-sagedeep/95 px-5 py-4 text-[15px] font-semibold text-white shadow-lg shadow-sagedeep/25 disabled:cursor-not-allowed disabled:opacity-55">
                {readyToComplete ? "Complete reset" : `Keep going - ${remaining}s`}
              </button>
            )}
          </div>

          {graceAvailable && (
            <>
              <button
                type="button"
                onClick={takeGrace}
                disabled={busy}
                className="frost-2 mt-3 w-full rounded-2xl px-5 py-3.5 text-center text-[14px] font-medium text-soft disabled:opacity-55"
              >
                I can't take the break right now
              </button>
              {demoActive && (
                <p className="mt-2 text-center text-[11px] text-soft">
                  Demo: 15-second accelerated grace · 10 minutes in the real product
                </p>
              )}
            </>
          )}

          <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-soft">
            <CheckCircle2 className="size-3.5 text-sagedeep" /> Completion and verification are recorded through MOVA.
          </p>
        </section>
      </div>
    </div>
  );
}
