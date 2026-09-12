// Phase 2 — strict domain types. No `any` leaks into UI.
// Firestore Timestamps are converted in mova-repo; UI only sees ISO strings.

export type AuthStatus = "disabled" | "loading" | "ready" | "error";

export type AuthenticatedMovaUser = {
  uid: string;
  isAnonymous: boolean;
  displayName: string | null;
  email: string | null;
};

export type ActivityCategory = "movement" | "stretch" | "walking" | "breathing" | "recovery";
export type ActivityDifficulty = "ease" | "moderate";
export type VerificationMethod = "manual" | "camera" | "distance" | "timed";
export type VerificationStatus = "none" | "not_started" | "pending" | "preparing" | "scanning" | "verified" | "failed" | "declined";
export type CameraPermissionStatus = "unknown" | "granted" | "denied" | "unavailable";
export type NotificationPermissionStatus = "unknown" | "granted" | "denied" | "unsupported";
export type ReminderStatus = "scheduled" | "triggered" | "dismissed" | "opened" | "completed";

export type VerificationResult = {
  status: "verified" | "failed";
  method: VerificationMethod;
  verifiedAt: string | null;
  confidence?: number;
  message: string;
};

export type Reminder = {
  id: string;
  resetId: string;
  scheduledFor: string;
  title: string;
  body: string;
  status: ReminderStatus;
  createdAt: string;
  triggeredAt: string | null;
  openedAt: string | null;
};

export type Activity = {
  id: string;
  name: string;
  category: ActivityCategory;
  description: string;
  durationSeconds: number;
  difficulty: ActivityDifficulty;
  verificationType: VerificationMethod;
  instructions: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ResetStatus = "scheduled" | "active" | "completed" | "rescheduled" | "skipped";
export type ResetContext = "schedule" | "reschedule" | "manual";
export type LocationPermissionStatus = "unknown" | "granted" | "denied" | "unavailable" | "timeout";
export type SavedPlaceLabel = "home" | "school" | "work";
export type LocationContext = "home" | "school" | "work" | "unknown" | "on_the_move";

export type SavedPlace = {
  id: string;
  label: SavedPlaceLabel;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  createdAt: string;
  updatedAt: string;
};

export type LocationSnapshot = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  timestamp: string;
};

export type WalkingSession = {
  id: string;
  resetId: string;
  startedAt: string;
  endedAt: string | null;
  distanceMeters: number;
  distanceMiles: number;
  status: "active" | "completed" | "idle";
};

export type Reset = {
  id: string;
  activityId: string;
  status: ResetStatus;
  scheduledFor: string;
  startedAt: string | null;
  completedAt: string | null;
  verifiedAt: string | null;
  rescheduledAt: string | null;
  rescheduleReason: string | null;
  context: ResetContext;
  verificationStatus: VerificationStatus;
  verificationMethod: VerificationMethod;
  distanceMeters: number | null;
  createdAt: string;
  updatedAt: string;
  graceUntil: string | null;
  graceUsed: boolean;
  locationContext?: LocationContext;
};

export type CheckIn = {
  id: string;
  resetId: string;
  feeling: string;
  needs: string[];
  createdAt: string;
};

export type UserDocument = {
  displayName: string | null;
  email: string | null;
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MovaProfile = {
  occupation: string;
  workStyle: string[];
  constraints: string[];
  breakRhythm: string;
  goals: string[];
  movementPreference: string | null;
  preferredActivityTypes: string[];
  typicalLocations: string[];
  updatedAt: string;
};

export type PrivacyPreferences = {
  shareAggregatedWorkplaceData: boolean;
  allowPersonalization: boolean;
};

export type MovaSettings = {
  notificationsEnabled: boolean;
  locationEnabled: boolean;
  cameraVerificationEnabled: boolean;
  preferredReminderStyle: "gentle" | "firm" | "silent";
  privacy: PrivacyPreferences;
  suppressedInsightIds: string[];
  updatedAt: string;
};

export type OnboardingDraft = {
  occupation: string;
  displayName?: string;
  customOccupation?: string;
  workStyle: string[];
  constraints: string[];
  breakRhythm: string;
  goals?: string[];
};

export type MovaLocationState = {
  permissionStatus: LocationPermissionStatus;
  currentSnapshot: LocationSnapshot | null;
  currentContext: LocationContext;
  savedPlaces: SavedPlace[];
  isDemoMode: boolean;
  walkingSession: WalkingSession | null;
};

export type MovaState = {
  user: AuthenticatedMovaUser | null;
  userDoc: UserDocument | null;
  profile: MovaProfile | null;
  settings: MovaSettings | null;
  resets: Reset[];
  checkIns: CheckIn[];
  onboarded: boolean;
  currentResetId: string | null;
  dailyScheduleDate: string | null;
  lastFeeling?: string | undefined;
  lastNeeds: string[];
};

export type HydratedState = {
  userDoc: UserDocument | null;
  profile: MovaProfile | null;
  settings: MovaSettings | null;
  resets: Reset[];
  checkIns: CheckIn[];
  onboarded: boolean;
  dailyScheduleDate: string | null;
};

export function nowIso(): string {
  return new Date().toISOString();
}

export function displayTimeFromIso(iso: string, fallback = ""): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return fallback || "—";
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return fallback || "—";
  }
}

export function dayKeyFromIso(iso: string, offsetMs = 0): string {
  try {
    const d = new Date(new Date(iso).getTime() + offsetMs);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

export function minutesUntilIso(iso: string): number {
  try {
    const diff = new Date(iso).getTime() - Date.now();
    return Math.max(0, Math.round(diff / 60000));
  } catch {
    return 0;
  }
}

export function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60000).toISOString();
}

export function minutesUntil(iso: string): number {
  try {
    return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
  } catch {
    return 0;
  }
}

export function formatScheduledTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export function emptyProfile(): MovaProfile {
  return {
    occupation: "",
    workStyle: [],
    constraints: [],
    breakRhythm: "",
    goals: [],
    movementPreference: null,
    preferredActivityTypes: [],
    typicalLocations: [],
    updatedAt: nowIso(),
  };
}

export function defaultSettings(): MovaSettings {
  return {
    notificationsEnabled: true,
    locationEnabled: false,
    cameraVerificationEnabled: true,
    preferredReminderStyle: "gentle",
    privacy: {
      shareAggregatedWorkplaceData: false,
      allowPersonalization: true,
    },
    suppressedInsightIds: [],
    updatedAt: nowIso(),
  };
}



