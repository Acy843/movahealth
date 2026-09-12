// Phase 2 — global activity catalogue (shared across all users).
// Decision: a static, typed, build-time catalogue rather than per-user copies.
// User-specific activity preferences live on the profile (preferredActivityTypes,
// movementPreference) and the scheduler picks from this catalogue deterministically.
// Firestore rules reserve an /activities collection (read-only) for a future
// admin-seeded global catalogue; today the app uses these constants directly.

import type { Activity, MovaProfile } from "@/lib/mova-types";

const T = "2026-01-01T00:00:00.000Z";

export const ACTIVITY_CATALOGUE: readonly Activity[] = [
  {
    id: "desk-stretch",
    name: "Desk Stretch",
    category: "stretch",
    description: "Stand up and release the tension that builds up after long desk time.",
    durationSeconds: 90,
    difficulty: "ease",
    verificationType: "manual",
    instructions:
      "Stand with feet hip-width apart. Reach both arms overhead, then gently lean to each side for three breaths. Shrug your shoulders up, hold for two seconds, and drop.",
    active: true,
    createdAt: T,
    updatedAt: T,
  },
  {
    id: "neck-shoulder-reset",
    name: "Neck & Shoulder Reset",
    category: "stretch",
    description: "Targets the neck and shoulders — the first place stress lands.",
    durationSeconds: 120,
    difficulty: "ease",
    verificationType: "camera",
    instructions:
      "Sit tall. Tilt your head toward each shoulder, holding for three breaths per side. Roll your shoulders backward in slow circles ten times, then forward ten times.",
    active: true,
    createdAt: T,
    updatedAt: T,
  },
  {
    id: "short-walk",
    name: "Short Walk",
    category: "walking",
    description: "A two-minute walk to reset your legs, focus and energy.",
    durationSeconds: 10,
    difficulty: "ease",
    verificationType: "distance",
    instructions:
      "Walk at a comfortable pace for two minutes. Keep your shoulders loose and take a few deeper breaths as you go. Any two minutes of walking counts.",
    active: true,
    createdAt: T,
    updatedAt: T,
  },
  {
    id: "standing-reset",
    name: "Standing Reset",
    category: "movement",
    description: "Get out of the chair and re-awaken your whole body.",
    durationSeconds: 90,
    difficulty: "ease",
    verificationType: "camera",
    instructions:
      "Stand up. Roll your hips twice in each direction, reach for the sky, then fold forward and let your head hang for three breaths. Rise slowly.",
    active: true,
    createdAt: T,
    updatedAt: T,
  },
  {
    id: "hip-mobility",
    name: "Hip Mobility",
    category: "movement",
    description: "Opens tight hips from long periods of sitting or standing.",
    durationSeconds: 10,
    difficulty: "moderate",
    verificationType: "manual",
    instructions:
      "Step one foot forward into a low lunge. Hold for three breaths, then gently twist toward the front leg. Switch sides. Repeat twice per leg.",
    active: true,
    createdAt: T,
    updatedAt: T,
  },
{
    id: "deep-breathing",
    name: "Deep Breathing",
    category: "breathing",
    description: "Ninety seconds of slow breathing to settle your nervous system.",
    durationSeconds: 10,
    difficulty: "ease",
    verificationType: "timed",
    instructions:
      "Inhale through your nose for four counts, hold for four, exhale for six. Follow the breathing circle. Continue for the full ninety seconds.",
    active: true,
    createdAt: T,
    updatedAt: T,
  },
  {
    id: "grounding-breath",
    name: "Grounding Breath",
    category: "breathing",
    description: "A quick mental reset for noisy or high-pressure moments.",
    durationSeconds: 10,
    difficulty: "ease",
    verificationType: "timed",
    instructions:
      "Sit or stand and notice your feet on the floor. Breathe in for four, out for four. Name five things you can see, then return to your breath.",
    active: true,
    createdAt: T,
    updatedAt: T,
  },
  {
    id: "full-body-stretch",
    name: "Full Body Stretch",
    category: "stretch",
    description: "A longer full-body reset for when you have more time.",
    durationSeconds: 10,
    difficulty: "moderate",
    verificationType: "manual",
    instructions:
      "Work through your body slowly: neck, shoulders, spine, hips, hamstrings. Hold each stretch for three breaths. Keep every movement gentle.",
    active: true,
    createdAt: T,
    updatedAt: T,
  },
  {
    id: "eye-break",
    name: "Eye Break",
    category: "recovery",
    description: "Gives screen-tired eyes and a strained neck a real pause.",
    durationSeconds: 10,
    difficulty: "ease",
    verificationType: "manual",
    instructions:
      "Look away from the screen at something at least six metres away. Slowly focus near, then far, five times. Blink fully, then roll your eyes gently.",
    active: true,
    createdAt: T,
    updatedAt: T,
  },
  {
    id: "posture-reset",
    name: "Posture Reset",
    category: "recovery",
    description: "Realigns your spine from an hour of hunching.",
    durationSeconds: 15,
    difficulty: "ease",
    verificationType: "camera",
    instructions:
      "Sit up, tuck your chin slightly, and roll your shoulders back and down. Squeeze your shoulder blades together for five seconds, release, repeat five times.",
    active: true,
    createdAt: T,
    updatedAt: T,
  },
  {
    id: "light-movement",
    name: "Light Movement",
    category: "movement",
    description: "Gentle movement to shake off stiffness and refocus your mind.",
    durationSeconds: 10,
    difficulty: "ease",
    verificationType: "timed",
    instructions:
      "March in place, swing your arms, and roll your wrists and ankles. Let your body move loosely for two and a half minutes.",
    active: true,
    createdAt: T,
    updatedAt: T,
  },
];

const byId = new Map<string, Activity>(ACTIVITY_CATALOGUE.map((a) => [a.id, a]));

export function activityById(id: string | null | undefined): Activity | null {
  if (!id) return null;
  return byId.get(id) ?? null;
}

export function activityName(id: string | null | undefined): string {
  return activityById(id)?.name ?? "Reset";
}

export function secondsLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

/** Alias used by route components. */
export const getActivity = activityById;

/** Human duration label for UI. */
export function displayDuration(durationSeconds: number): string {
  return secondsLabel(durationSeconds);
}

const DESK_OCCUPATIONS = ["healthcare", "office", "teacher", "developer", "admin", "nurse"];

/**
 * Deterministic activity pool selection from the real profile fields.
 * Explainable rules only — no AI, no learning.
 */
export function selectActivitiesForProfile(profile: MovaProfile): Activity[] {
  const active = ACTIVITY_CATALOGUE.filter((a) => a.active);
  const occupation = (profile.occupation || "").toLowerCase();
  const deskBased =
    DESK_OCCUPATIONS.some((o) => occupation.includes(o)) ||
    profile.workStyle.some((w) => (w ?? "").toLowerCase().includes("desk"));
  const prefersWalking =
    profile.movementPreference === "walking" || profile.preferredActivityTypes.includes("walking");
  const prefersBreathing = profile.preferredActivityTypes.includes("breathing");

  const filtered = active.filter((a) => {
    if (a.category === "walking") return prefersWalking || !deskBased;
    return true;
  });

  const pool = filtered.length > 0 ? filtered : active;

  return [...pool].sort((a, b) => score(b) - score(a));

  function score(a: Activity): number {
    let v = 0;
    if (prefersWalking && a.category === "walking") v += 3;
    if (prefersBreathing && a.category === "breathing") v += 3;
    if (deskBased && (a.category === "stretch" || a.id === "posture-reset" || a.id === "eye-break")) v += 2;
    if (!deskBased && a.category === "movement") v += 2;
    if (profile.breakRhythm === "frequent" && a.durationSeconds <= 120) v += 1;
    if (profile.breakRhythm === "long" && a.durationSeconds >= 150) v += 1;
    return v;
  }
}