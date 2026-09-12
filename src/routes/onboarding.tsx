import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { MovaScreen, PrimaryButton, SelectChip } from "@/components/mova/screen";
import { useMova } from "@/lib/mova-store";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Build your Reset Profile | MOVA" },
      {
        name: "description",
        content:
          "Tell MOVA about your occupation, workday and constraints so your resets fit your real shift.",
      },
      { property: "og:title", content: "Build your Reset Profile | MOVA" },
      {
        property: "og:description",
        content: "Your workday is different. Your resets should be too.",
      },
    ],
  }),
  component: Onboarding,
});

const occupations = [
  "Healthcare",
  "Office / Administration",
  "Technology",
  "Student",
  "Education",
  "Retail",
  "Driving / Transport",
  "Construction",
  "Manufacturing",
  "Hospitality",
  "Creative / Freelance",
  "Other",
];

const workStyles = [
  "Mostly sitting",
  "Mostly standing",
  "Walking frequently",
  "Physically demanding",
  "Screen-heavy",
  "Mentally demanding",
  "Customer-facing",
  "Safety-critical",
  "Unpredictable / constantly changing",
];

const constraints = [
  "I can't use my phone while working",
  "I work with patients/customers",
  "I work around machinery",
  "I drive during work",
  "I have unpredictable breaks",
  "I have access to a private space",
  "I usually work at a desk",
  "I work outdoors",
];

const rhythms = [
  "Every 30 minutes",
  "Every hour",
  "Every 90 minutes",
  "A few times during the day",
  "My schedule is unpredictable",
];

const steps = ["What do you do?", "What does your workday look like?", "What are your work constraints?", "When can you usually take short breaks?"];

function Onboarding() {
  const navigate = useNavigate();
  const { profile, onboarded, authReady, completeOnboarding, savingOnboarding, onboardingError, state } = useMova();
  const [step, setStep] = useState(0);
  const [occupation, setOccupation] = useState(profile?.occupation ?? "");
  const [displayName, setDisplayName] = useState(state.userDoc?.displayName ?? "");
  const [custom, setCustom] = useState("");
  const [styles, setStyles] = useState<string[]>(profile?.workStyle ?? []);
  const [limits, setLimits] = useState<string[]>(profile?.constraints ?? []);
  const [rhythm, setRhythm] = useState(profile?.breakRhythm ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!onboarded) return;
    void navigate({ to: "/home" });
  }, [navigate, onboarded]);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const stepError = () => {
    if (step === 0 && (!occupation || (occupation === "Other" && !custom.trim()))) {
      return occupation === "Other" ? "Add your occupation to continue." : "Choose your occupation to continue.";
    }
    if (step === 1 && styles.length === 0) return "Select at least one workday style to continue.";
    if (step === 2 && limits.length === 0) return "Select at least one constraint to continue.";
    if (step === 3 && !rhythm) return "Choose when you can take breaks to continue.";
    return null;
  };

  const finish = async () => {
    setSaving(true);
    setError(null);
    setNameError(null);
    try {
      await completeOnboarding({
        occupation: occupation || "Healthcare",
        displayName: displayName.trim(),
        customOccupation: custom,
        workStyle: styles,
        constraints: limits,
        breakRhythm: rhythm || "My schedule is unpredictable",
      });
      navigate({ to: "/reset-profile" });
    } catch (e) {
      setError(e instanceof Error ? e.message : onboardingError ?? "save_failed");
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    const invalid = stepError();
    if (invalid) {
      setValidationError(invalid);
      return;
    }
    setValidationError(null);
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setNameError("Please tell us what to call you.");
      setShowNamePrompt(true);
      return;
    }
    void finish();
  };

  if (!authReady) {
    return (
      <MovaScreen withNav={false}>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[13px] text-soft">Setting up your space…</p>
        </div>
      </MovaScreen>
    );
  }

  if (onboarded) {
    return (
      <MovaScreen withNav={false}>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[13px] text-soft">Taking you home…</p>
        </div>
      </MovaScreen>
    );
  }

  return (
    <MovaScreen withNav={false}>
      <div className="animate-rise">
        <p className="text-[11px] font-semibold tracking-[0.24em] text-sagedeep uppercase">
          Step {step + 1} of 4
        </p>
        <h1 className="mt-1 font-display text-[28px] leading-[1.08] font-semibold text-ink">
          Let's build your Reset Profile
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-soft">
          Your workday is different. Your resets should be too.
        </p>
        <div className="mt-4 flex gap-1.5">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                i <= step ? "bg-gradient-to-r from-sage to-sky" : "bg-mist"
              }`}
            />
          ))}
        </div>
      </div>

      <h2 className="mt-7 text-[17px] font-semibold text-ink">{steps[step]}</h2>

      <div className="mt-4 flex-1">
        {step === 0 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              {occupations.map((o) => (
                <SelectChip
                  key={o}
                  label={o}
                  selected={occupation === o}
                  onClick={() => {
                    setOccupation(o);
                    setValidationError(null);
                  }}
                />
              ))}
            </div>
            {occupation === "Other" && (
              <input
                value={custom}
                onChange={(e) => {
                  setCustom(e.target.value);
                  setValidationError(null);
                }}
                placeholder="Type your occupation"
                className="frost-2 w-full rounded-2xl px-4 py-3.5 text-[14px] text-ink placeholder:text-soft/70 focus:ring-2 focus:ring-sage/40 focus:outline-none"
              />
            )}
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-2.5">
            {workStyles.map((w) => (
              <SelectChip
                key={w}
                label={w}
                selected={styles.includes(w)}
                onClick={() => {
                  toggle(styles, setStyles, w);
                  setValidationError(null);
                }}
              />
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-2.5">
            {constraints.map((c) => (
              <SelectChip
                key={c}
                label={c}
                selected={limits.includes(c)}
                onClick={() => {
                  toggle(limits, setLimits, c);
                  setValidationError(null);
                }}
              />
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-2.5">
            {rhythms.map((r) => (
              <SelectChip
                key={r}
                label={r}
                selected={rhythm === r}
                onClick={() => {
                  setRhythm(r);
                  setValidationError(null);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="frost-2 mt-6 flex items-start gap-3 rounded-2xl p-4">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-sagedeep" strokeWidth={1.75} />
        <p className="text-[11.5px] leading-relaxed text-soft">
          Your information helps personalize your resets. MOVA is designed to minimize
          unnecessary monitoring.
        </p>
      </div>

      <div className="mt-4 flex gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="frost-2 rounded-2xl px-6 py-4 text-[14px] font-medium text-soft"
            disabled={saving || savingOnboarding}
          >
            Back
          </button>
        )}
        <PrimaryButton onClick={next} disabled={saving || savingOnboarding}>
          {step < 3 ? "Continue" : saving || savingOnboarding ? "Saving…" : "See my profile"}
        </PrimaryButton>
      </div>
      {(validationError || error || onboardingError) && (
        <p className="mt-3 text-center text-[12.5px] text-soft">
          {validationError ?? `Couldn't save just now — your answers are kept on this device. ${error ?? onboardingError}`}
        </p>
      )}

      {showNamePrompt && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-2xl">
            <p className="text-[10px] font-semibold tracking-[0.24em] text-sagedeep uppercase">Welcome</p>
            <h3 className="mt-2 font-display text-[24px] font-semibold text-ink">What should we call you?</h3>
            <p className="mt-2 text-[12.5px] leading-relaxed text-soft">
              We’ll use this name across your home screen, profile, and check-ins.
            </p>
            <input
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (nameError) setNameError(null);
              }}
              placeholder="Your name"
              className="mt-4 w-full rounded-2xl border border-sage/25 bg-mist/40 px-4 py-3 text-[14px] text-ink placeholder:text-soft/70 focus:border-sage/50 focus:outline-none"
              autoFocus
            />
            {nameError && <p className="mt-2 text-[12px] text-soft">{nameError}</p>}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowNamePrompt(false);
                  setNameError(null);
                }}
                className="frost-2 flex-1 rounded-2xl px-4 py-3 text-[14px] font-medium text-soft"
              >
                Back
              </button>
              <button
                type="button"
                onClick={async () => {
                  const trimmed = displayName.trim();
                  if (!trimmed) {
                    setNameError("Please tell us what to call you.");
                    return;
                  }
                  setShowNamePrompt(false);
                  setNameError(null);
                  await finish();
                }}
                className="flex-1 rounded-2xl bg-sagedeep/95 px-4 py-3 text-[14px] font-semibold text-white shadow-lg shadow-sagedeep/25"
              >
                Save name
              </button>
            </div>
          </div>
        </div>
      )}
    </MovaScreen>
  );
}
