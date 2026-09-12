// Phase 1+2 repository: users/{uid}, profile/main, settings/main, resets, checkins.
// No `any`. Firestore Timestamps converted here; UI sees ISO strings only.

import { getFirestoreDbAsync } from "@/lib/firebase";
import { defaultSettings, nowIso } from "@/lib/mova-types";
import type {
  CheckIn,
  MovaProfile,
  MovaSettings,
  Reset,
  ResetContext,
  ResetStatus,
  SavedPlace,
  UserDocument,
  VerificationMethod,
  VerificationStatus,
} from "@/lib/mova-types";

export const USERS = "users";
export const PROFILE = "profile";
export const SETTINGS = "settings";
export const MAIN = "main";
export const RESETS = "resets";
export const CHECKINS = "checkins";
export const PLACES = "places";

type DocSnap = { exists: () => boolean; data: () => Record<string, unknown> };
type ColSnap = { forEach: (cb: (d: { id: string; data: () => Record<string, unknown> }) => void) => void };
type FM = {
  doc: (...a: unknown[]) => unknown;
  collection: (...a: unknown[]) => unknown;
  getDoc: (r: unknown) => Promise<DocSnap>;
  setDoc: (r: unknown, d: Record<string, unknown>, o?: Record<string, unknown>) => Promise<void>;
  getDocs: (q: unknown) => Promise<ColSnap>;
  query: (...a: unknown[]) => unknown;
  where: (...a: unknown[]) => unknown;
  orderBy: (...a: unknown[]) => unknown;
  limit: (...a: unknown[]) => unknown;
  serverTimestamp: () => unknown;
  Timestamp: { fromDate: (d: Date) => unknown };
};

async function fm(): Promise<FM> {
  return (await import("firebase/firestore")) as unknown as FM;
}

function iso(v: unknown, fb: string): string {
  const t = v as { toDate?: () => Date } | null | undefined;
  if (t && typeof t.toDate === "function") return t.toDate().toISOString();
  if (typeof v === "string" && v) return v;
  return fb;
}

function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function sa(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

const RESET_STATUSES: readonly ResetStatus[] = ["scheduled", "active", "completed", "rescheduled", "skipped"];
const CONTEXTS: readonly ResetContext[] = ["schedule", "reschedule", "manual"];
const VERIFICATION_STATUSES: readonly VerificationStatus[] = ["none", "pending", "verified", "declined"];
const VERIFICATION_METHODS: readonly VerificationMethod[] = ["manual", "camera", "distance", "timed"];

function pick<T extends string>(v: unknown, allowed: readonly T[], fb: T): T {
  return allowed.includes(v as T) ? (v as T) : fb;
}

// ── converters ───────────────────────────────────────────────────────────

export function toUser(d: Record<string, unknown>, fb: string): UserDocument {
  return {
    displayName: typeof d["displayName"] === "string" ? (d["displayName"] as string) : null,
    email: typeof d["email"] === "string" ? (d["email"] as string) : null,
    onboardingCompleted: d["onboardingCompleted"] === true,
    createdAt: iso(d["createdAt"], fb),
    updatedAt: iso(d["updatedAt"] ?? d["createdAt"], fb),
  };
}

export function toProfile(d: Record<string, unknown>, fb: string): MovaProfile {
  return {
    occupation: s(d["occupation"]),
    workStyle: sa(d["workStyle"]),
    constraints: sa(d["constraints"]),
    breakRhythm: s(d["breakRhythm"]),
    goals: sa(d["goals"]),
    movementPreference: typeof d["movementPreference"] === "string" ? (d["movementPreference"] as string) : null,
    preferredActivityTypes: sa(d["preferredActivityTypes"]),
    typicalLocations: sa(d["typicalLocations"]),
    updatedAt: iso(d["updatedAt"], fb),
  };
}

export function toSettings(d: Record<string, unknown>, fb: string): MovaSettings {
  const f = defaultSettings();
  const p = (d["privacy"] ?? {}) as Record<string, unknown>;
  const style = d["preferredReminderStyle"];
  return {
    notificationsEnabled: typeof d["notificationsEnabled"] === "boolean" ? (d["notificationsEnabled"] as boolean) : f.notificationsEnabled,
    locationEnabled: typeof d["locationEnabled"] === "boolean" ? (d["locationEnabled"] as boolean) : f.locationEnabled,
    cameraVerificationEnabled: typeof d["cameraVerificationEnabled"] === "boolean" ? (d["cameraVerificationEnabled"] as boolean) : f.cameraVerificationEnabled,
    preferredReminderStyle: style === "firm" || style === "silent" ? (style as MovaSettings["preferredReminderStyle"]) : f.preferredReminderStyle,
    privacy: {
      shareAggregatedWorkplaceData: typeof p["shareAggregatedWorkplaceData"] === "boolean" ? (p["shareAggregatedWorkplaceData"] as boolean) : f.privacy.shareAggregatedWorkplaceData,
      allowPersonalization: typeof p["allowPersonalization"] === "boolean" ? (p["allowPersonalization"] as boolean) : f.privacy.allowPersonalization,
    },
    suppressedInsightIds: sa(d["suppressedInsightIds"] ?? f.suppressedInsightIds),
    updatedAt: iso(d["updatedAt"], fb),
  };
}

export function toReset(id: string, d: Record<string, unknown>, fb: string): Reset {
  const locationContext = d["locationContext"] === "home" || d["locationContext"] === "school" || d["locationContext"] === "work" || d["locationContext"] === "on_the_move" ? d["locationContext"] : null;
  return {
    id,
    activityId: s(d["activityId"]) || "desk-stretch",
    status: pick(d["status"], RESET_STATUSES, "scheduled"),
    scheduledFor: iso(d["scheduledFor"], fb),
    startedAt: d["startedAt"] ? iso(d["startedAt"], fb) : null,
    completedAt: d["completedAt"] ? iso(d["completedAt"], fb) : null,
    verifiedAt: d["verifiedAt"] ? iso(d["verifiedAt"], fb) : null,
    rescheduledAt: d["rescheduledAt"] ? iso(d["rescheduledAt"], fb) : null,
    rescheduleReason: typeof d["rescheduleReason"] === "string" ? (d["rescheduleReason"] as string) : null,
    context: pick(d["context"], CONTEXTS, "schedule"),
    verificationStatus: pick(d["verificationStatus"], VERIFICATION_STATUSES, "none"),
    verificationMethod: pick(d["verificationMethod"], VERIFICATION_METHODS, "manual"),
    distanceMeters: typeof d["distanceMeters"] === "number" ? (d["distanceMeters"] as number) : null,
    createdAt: iso(d["createdAt"], fb),
    updatedAt: iso(d["updatedAt"] ?? d["createdAt"], fb),
    graceUntil: d["graceUntil"] ? iso(d["graceUntil"], fb) : null,
    graceUsed: d["graceUsed"] === true,
    ...(locationContext ? { locationContext } : {}),
  };
}

export function toCheckIn(id: string, d: Record<string, unknown>, fb: string): CheckIn {
  return {
    id,
    resetId: s(d["resetId"]),
    feeling: s(d["feeling"]) || "—",
    needs: sa(d["needs"]),
    createdAt: iso(d["createdAt"], fb),
  };
}

/** ISO fields on a Reset are stored as real Firestore Timestamps. */
function resetToDoc(r: Omit<Reset, "id">, m: FM, serverCreated: boolean): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    activityId: r.activityId,
    status: r.status,
    scheduledFor: m.Timestamp.fromDate(new Date(r.scheduledFor)),
    context: r.context,
    verificationStatus: r.verificationStatus,
    verificationMethod: r.verificationMethod,
    updatedAt: m.serverTimestamp(),
  };
  if (serverCreated) doc["createdAt"] = m.serverTimestamp();
  else doc["createdAt"] = m.Timestamp.fromDate(new Date(r.createdAt));
  if (r.startedAt) doc["startedAt"] = m.Timestamp.fromDate(new Date(r.startedAt));
  if (r.completedAt) doc["completedAt"] = m.Timestamp.fromDate(new Date(r.completedAt));
  if (r.verifiedAt) doc["verifiedAt"] = m.Timestamp.fromDate(new Date(r.verifiedAt));
  if (r.rescheduledAt) doc["rescheduledAt"] = m.Timestamp.fromDate(new Date(r.rescheduledAt));
  if (r.rescheduleReason) doc["rescheduleReason"] = r.rescheduleReason;
  if (typeof r.distanceMeters === "number") doc["distanceMeters"] = r.distanceMeters;
  if (r.graceUntil) doc["graceUntil"] = m.Timestamp.fromDate(new Date(r.graceUntil));
  if (r.graceUsed) doc["graceUsed"] = r.graceUsed;
  if (r.locationContext) doc["locationContext"] = r.locationContext;
  return doc;
}

// ── user / profile / settings ────────────────────────────────────────────

export async function fetchUser(uid: string, fb: string): Promise<UserDocument | null> {
  const db = await getFirestoreDbAsync();
  const m = await fm();
  const snap = await m.getDoc(m.doc(db, USERS, uid));
  if (!snap.exists()) return null;
  return toUser(snap.data(), fb);
}

export async function fetchProfile(uid: string, fb: string): Promise<MovaProfile | null> {
  const db = await getFirestoreDbAsync();
  const m = await fm();
  const snap = await m.getDoc(m.doc(db, USERS, uid, PROFILE, MAIN));
  if (!snap.exists()) return null;
  return toProfile(snap.data(), fb);
}

export async function fetchSettings(uid: string, fb: string): Promise<MovaSettings | null> {
  const db = await getFirestoreDbAsync();
  const m = await fm();
  const snap = await m.getDoc(m.doc(db, USERS, uid, SETTINGS, MAIN));
  if (!snap.exists()) return null;
  return toSettings(snap.data(), fb);
}

export async function ensureUser(uid: string): Promise<void> {
  const db = await getFirestoreDbAsync();
  const m = await fm();
  const ref = m.doc(db, USERS, uid);
  const snap = await m.getDoc(ref);
  if (snap.exists()) return;
  await m.setDoc(ref, {
    displayName: null,
    email: null,
    onboardingCompleted: false,
    createdAt: m.serverTimestamp(),
    updatedAt: m.serverTimestamp(),
  });
}

export async function saveUser(uid: string, patch: Partial<Omit<UserDocument, "createdAt" | "updatedAt">>): Promise<void> {
  const db = await getFirestoreDbAsync();
  const m = await fm();
  await m.setDoc(m.doc(db, USERS, uid), { ...patch, updatedAt: m.serverTimestamp() }, { merge: true });
}

export async function saveProfile(uid: string, p: MovaProfile): Promise<void> {
  const db = await getFirestoreDbAsync();
  const m = await fm();
  await m.setDoc(m.doc(db, USERS, uid, PROFILE, MAIN), { ...p, updatedAt: m.serverTimestamp() }, { merge: true });
}

export async function saveSettings(uid: string, st: MovaSettings): Promise<void> {
  const db = await getFirestoreDbAsync();
  const m = await fm();
  await m.setDoc(m.doc(db, USERS, uid, SETTINGS, MAIN), { ...st, updatedAt: m.serverTimestamp() }, { merge: true });
}

export async function ensureSettings(uid: string, fb = nowIso()): Promise<MovaSettings> {
  const ex = await fetchSettings(uid, fb);
  if (ex) return ex;
  const fresh = defaultSettings();
  await saveSettings(uid, fresh);
  return fresh;
}

export async function fetchPlaces(uid: string): Promise<SavedPlace[]> {
  const db = await getFirestoreDbAsync();
  const m = await fm();
  const q = m.collection(db, USERS, uid, PLACES);
  const snap = await m.getDocs(q);
  const out: SavedPlace[] = [];
  snap.forEach((d) => {
    const data = d.data();
    const label = d.id;
    const normalized = label === "home" || label === "school" || label === "work" ? label : "home";
    out.push({
      id: d.id,
      label: normalized,
      latitude: typeof data["latitude"] === "number" ? (data["latitude"] as number) : 0,
      longitude: typeof data["longitude"] === "number" ? (data["longitude"] as number) : 0,
      radiusMeters: typeof data["radiusMeters"] === "number" ? (data["radiusMeters"] as number) : 250,
      createdAt: iso(data["createdAt"], nowIso()),
      updatedAt: iso(data["updatedAt"] ?? data["createdAt"], nowIso()),
    });
  });
  return out;
}

export async function upsertPlace(uid: string, place: SavedPlace): Promise<SavedPlace> {
  const db = await getFirestoreDbAsync();
  const m = await fm();
  const docId = place.id || place.label;
  const payload = {
    label: place.label,
    latitude: place.latitude,
    longitude: place.longitude,
    radiusMeters: place.radiusMeters,
    createdAt: place.createdAt,
    updatedAt: place.updatedAt,
  };
  await m.setDoc(m.doc(db, USERS, uid, PLACES, docId), payload, { merge: true });
  return { ...place, id: docId };
}

// ── resets ───────────────────────────────────────────────────────────────

/** Deterministic-id upsert used by the idempotent scheduler. */
export async function putReset(uid: string, r: Reset): Promise<void> {
  const db = await getFirestoreDbAsync();
  const m = await fm();
  await m.setDoc(m.doc(db, USERS, uid, RESETS, r.id), resetToDoc(r, m, false));
}

/** Partial lifecycle update (status transitions, timestamps). */
export async function updateReset(
  uid: string,
  resetId: string,
  patch: Partial<Omit<Reset, "id" | "createdAt">>,
): Promise<void> {
  const db = await getFirestoreDbAsync();
  const m = await fm();
  const doc: Record<string, unknown> = { updatedAt: m.serverTimestamp() };
  if (patch.status) doc["status"] = patch.status;
  if (patch.activityId) doc["activityId"] = patch.activityId;
  if (patch.scheduledFor) doc["scheduledFor"] = m.Timestamp.fromDate(new Date(patch.scheduledFor));
  if (patch.startedAt) doc["startedAt"] = m.Timestamp.fromDate(new Date(patch.startedAt));
  if (patch.completedAt) doc["completedAt"] = m.Timestamp.fromDate(new Date(patch.completedAt));
  if (patch.verifiedAt) doc["verifiedAt"] = m.Timestamp.fromDate(new Date(patch.verifiedAt));
  if (patch.rescheduledAt) doc["rescheduledAt"] = m.Timestamp.fromDate(new Date(patch.rescheduledAt));
  if (patch.rescheduleReason !== undefined) doc["rescheduleReason"] = patch.rescheduleReason;
  if (patch.context) doc["context"] = patch.context;
  if (patch.verificationStatus) doc["verificationStatus"] = patch.verificationStatus;
  if (patch.verificationMethod) doc["verificationMethod"] = patch.verificationMethod;
  if (patch.distanceMeters !== undefined) doc["distanceMeters"] = patch.distanceMeters;
  if (patch.graceUntil !== undefined) doc["graceUntil"] = patch.graceUntil ? m.Timestamp.fromDate(new Date(patch.graceUntil)) : null;
  if (patch.graceUsed !== undefined) doc["graceUsed"] = patch.graceUsed;
  if (patch.locationContext) doc["locationContext"] = patch.locationContext;
  await m.setDoc(m.doc(db, USERS, uid, RESETS, resetId), doc, { merge: true });
}

export async function getReset(uid: string, resetId: string, fb: string): Promise<Reset | null> {
  const db = await getFirestoreDbAsync();
  const m = await fm();
  const snap = await m.getDoc(m.doc(db, USERS, uid, RESETS, resetId));
  if (!snap.exists()) return null;
  return toReset(resetId, snap.data(), fb);
}

/** All resets scheduled within one local calendar day. */
export async function fetchResetsForDay(uid: string, dayStartIso: string, fb: string): Promise<Reset[]> {
  const db = await getFirestoreDbAsync();
  const m = await fm();
  const start = new Date(dayStartIso);
  start.setHours(0, 0, 0, 0);
  const end = new Date(dayStartIso);
  end.setHours(23, 59, 59, 999);
  const q = m.query(
    m.collection(db, USERS, uid, RESETS),
    m.where("scheduledFor", ">=", m.Timestamp.fromDate(start)),
    m.where("scheduledFor", "<=", m.Timestamp.fromDate(end)),
    m.orderBy("scheduledFor", "asc"),
  );
  const snap = await m.getDocs(q);
  const out: Reset[] = [];
  snap.forEach((d) => out.push(toReset(d.id, d.data(), fb)));
  return out;
}

/** Recent resets for history (newest first). */
export async function fetchRecentResets(uid: string, fb: string, pageSize = 50): Promise<Reset[]> {
  const db = await getFirestoreDbAsync();
  const m = await fm();
  const q = m.query(m.collection(db, USERS, uid, RESETS), m.orderBy("scheduledFor", "desc"), m.limit(pageSize));
  const snap = await m.getDocs(q);
  const out: Reset[] = [];
  snap.forEach((d) => out.push(toReset(d.id, d.data(), fb)));
  return out;
}

// ── check-ins ────────────────────────────────────────────────────────────

export async function addCheckInDoc(uid: string, input: { resetId: string; feeling: string; needs: string[] }): Promise<void> {
  const db = await getFirestoreDbAsync();
  const m = await fm();
  await m.setDoc(m.doc(db, USERS, uid, CHECKINS, `${Date.now()}-${input.resetId}`), {
    resetId: input.resetId,
    feeling: input.feeling,
    needs: input.needs,
    createdAt: m.serverTimestamp(),
  });
}

export async function fetchRecentCheckIns(uid: string, fb: string, pageSize = 50): Promise<CheckIn[]> {
  const db = await getFirestoreDbAsync();
  const m = await fm();
  const q = m.query(m.collection(db, USERS, uid, CHECKINS), m.orderBy("createdAt", "desc"), m.limit(pageSize));
  const snap = await m.getDocs(q);
  const out: CheckIn[] = [];
  snap.forEach((d) => out.push(toCheckIn(d.id, d.data(), fb)));
  return out;
}


