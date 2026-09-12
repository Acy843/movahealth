import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, Info } from "lucide-react";
import { FrostCard, MovaScreen, ScreenHeader } from "@/components/mova/screen";
import { useMova } from "@/lib/mova-store";

export const Route = createFileRoute("/verify")({
  head: () => ({
    meta: [
      { title: "Reset complete? | MOVA" },
      {
        name: "description",
        content:
          "MOVA confirms a reset with the least invasive method available — movement, steps, a break-area tap or a completed breathing sequence.",
      },
      { property: "og:title", content: "Reset complete? | MOVA" },
      {
        property: "og:description",
        content: "Verification uses only the information needed for this reset.",
      },
    ],
  }),
  component: VerifyScreen,
});

const checks = [
  { label: "Breathing sequence completed", detail: "Guided sequence finished", active: true },
  { label: "Movement detected", detail: "Shoulder movement sensed on device", active: true },
  { label: "24 steps detected", detail: "Used for walking resets", active: false },
  { label: "Break area confirmed", detail: "Optional workplace tap or QR", active: false },
  { label: "Reflection completed", detail: "Used for written resets", active: false },
];

function VerifyScreen() {
  const navigate = useNavigate();
  const { currentReset } = useMova();
  const cameraReset = currentReset?.verificationMethod === "camera";
  const walkingReset = currentReset?.verificationMethod === "distance";

  return (
    <MovaScreen withNav={false} tone="focus">
      <ScreenHeader
        eyebrow="Verification"
        title="Reset complete?"
        subtitle="MOVA uses the lightest check that suits the activity."
        back="/reset"
      />

      <div className="animate-rise relative mt-8 grid place-items-center">
        <div className="animate-breathe absolute size-40 rounded-full bg-sage/20 blur-xl" />
        <div className="frost relative grid size-36 place-items-center rounded-full">
          <Check className="size-14 text-sagedeep" strokeWidth={1.5} />
        </div>
      </div>
      <p className="mt-5 text-center text-[16px] font-semibold text-sagedeep">
        {cameraReset || walkingReset ? "Verification required" : "Reset verified"}
      </p>

      <div className="mt-7 space-y-2.5">
        {checks.map((c) => (
          <FrostCard
            key={c.label}
            soft
            className={`flex items-center gap-3 p-4 ${c.active ? "" : "opacity-55"}`}
          >
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-full ${
                c.active ? "bg-sage/20 text-sagedeep" : "bg-mist text-soft"
              }`}
            >
              <Check className="size-3.5" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-ink">{c.label}</p>
              <p className="text-[11.5px] text-soft">{c.detail}</p>
            </div>
          </FrostCard>
        ))}
      </div>

      <div className="frost-2 mt-5 flex items-start gap-3 rounded-2xl p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-sagedeep" strokeWidth={1.75} />
        <p className="text-[11.5px] leading-relaxed text-soft">
          Verification uses only the information needed for this reset. Nothing runs in the
          background between resets.
        </p>
      </div>

      <div className="mt-auto pt-8 space-y-3">
        {cameraReset ? (
          <button
            type="button"
            onClick={() => navigate({ to: "/scan" })}
            className="block w-full rounded-2xl bg-sagedeep/95 px-5 py-4 text-center text-[15px] font-semibold text-white shadow-lg shadow-sagedeep/25"
          >
            Open camera scan
          </button>
        ) : walkingReset ? (
          <button
            type="button"
            onClick={() => navigate({ to: "/walk" })}
            className="block w-full rounded-2xl bg-sagedeep/95 px-5 py-4 text-center text-[15px] font-semibold text-white shadow-lg shadow-sagedeep/25"
          >
            Start walking verification
          </button>
        ) : (
          <Link
            to="/checkin"
            className="block w-full rounded-2xl bg-sagedeep/95 px-5 py-4 text-center text-[15px] font-semibold text-white shadow-lg shadow-sagedeep/25"
          >
            Continue
          </Link>
        )}
      </div>
    </MovaScreen>
  );
}
