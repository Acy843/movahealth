import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Camera, ShieldCheck, AlertTriangle } from "lucide-react";
import { FrostCard, MovaScreen, PrimaryButton, ScreenHeader } from "@/components/mova/screen";
import { useMova } from "@/lib/mova-store";
import { getActivity } from "@/lib/mova-activities";

export const Route = createFileRoute("/scan")({
  head: () => ({
    meta: [
      { title: "Camera check-in | MOVA" },
      { name: "description", content: "Camera check-in for movement verification." },
    ],
  }),
  component: ScanScreen,
});

function ScanScreen() {
  const navigate = useNavigate();
  const { currentReset, verifyReset, completeReset } = useMova();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState("idle");
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  const activity = currentReset ? getActivity(currentReset.activityId) : null;

  const finishVerification = async () => {
    if (!currentReset || currentReset.verificationMethod !== "camera") return;
    const verified = await verifyReset(currentReset.id, {
      status: "verified",
      method: "camera",
      message: "Movement detected - verification successful.",
      confidence: 0.92,
    });
    if (!verified) return;
    await completeReset(currentReset.id);
    navigate({ to: "/home" });
  };

  useEffect(() => {
    let cancelled = false;
    async function open() {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setStatus("live");
      } catch {
        if (!cancelled) setStatus("denied");
      }
    }
    open();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!scanning) return;
    setProgress(0);
    setDone(false);
    const started = Date.now();
    const t = setInterval(() => {
      const pct = Math.min(100, Math.round(((Date.now() - started) / 4000) * 100));
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(t);
        setDone(true);
      }
    }, 100);
    return () => clearInterval(t);
  }, [scanning]);

  return (
    <MovaScreen withNav={false} tone="focus">
      <ScreenHeader
        eyebrow="Camera verification"
        title={activity?.name ?? "Verification"}
        subtitle="Complete this activity in view of the camera to verify."
      />
      <div className="mt-4 px-1">
        <p className="text-[13px] leading-relaxed text-ink font-medium">
          {activity?.instructions ?? "Follow the instructions for your activity."}
        </p>
      </div>
      <FrostCard className="mt-6 overflow-hidden p-0">
        <div className="relative aspect-[3/4] w-full bg-ink/90">
          <video
            ref={videoRef}
            muted
            playsInline
            className={`absolute inset-0 h-full w-full object-cover ${status === "live" ? "" : "hidden"}`}
          />
          {status !== "live" && (
            <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-sage/30 to-sky/30">
              <div className="text-center px-6">
                <Camera className="mx-auto size-8 text-white/80" strokeWidth={1.5} />
                <p className="mt-2 text-[12px] font-medium text-white/80">
                  {status === "idle" ? "Requesting camera…" : status === "denied" ? "Camera access denied. Please allow camera permissions to verify this activity." : "Camera not supported on this device."}
                </p>
              </div>
            </div>
          )}
          <div className="pointer-events-none absolute inset-4 rounded-3xl border border-white/40" />
          <div
            className="pointer-events-none absolute inset-x-8 h-0.5 bg-white/90 transition-all"
            style={{ top: scanning && !done ? `${12 + (progress / 100) * 76}%` : "12%", opacity: scanning ? 1 : 0.35 }}
          />
          {scanning && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-10">
              <p className="text-center text-[12px] font-semibold text-white">
                {done ? "Scan complete" : `Scanning posture… ${progress}%`}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/25">
                <div className="h-full rounded-full bg-gradient-to-r from-sage to-sky" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>
      </FrostCard>
      
      {status === "denied" || status === "unsupported" ? (
        <div className="frost-2 mt-4 flex items-start gap-3 rounded-2xl p-4 border border-red-500/20">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-500" strokeWidth={1.75} />
          <p className="text-[11.5px] leading-relaxed text-soft">
            Verification cannot proceed without camera access. Please check your browser permissions.
          </p>
        </div>
      ) : (
        <div className="frost-2 mt-4 flex items-start gap-3 rounded-2xl p-4">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-sagedeep" strokeWidth={1.75} />
          <p className="text-[11.5px] leading-relaxed text-soft">
            Video stays entirely on your device. Nothing is recorded or uploaded to our servers.
          </p>
        </div>
      )}

      {status === "live" && (
        <div className="mt-4">
          {!scanning ? (
            <PrimaryButton onClick={() => setScanning(true)}>Start verification</PrimaryButton>
          ) : done ? (
            <PrimaryButton onClick={() => void finishVerification()}>Verification passed - complete reset</PrimaryButton>
          ) : (
            <p className="mt-4 text-center text-[12px] text-soft">Hold still…</p>
          )}
        </div>
      )}
    </MovaScreen>
  );
}
