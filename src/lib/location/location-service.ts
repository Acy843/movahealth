import type { LocationContext, LocationPermissionStatus, LocationSnapshot, SavedPlace, WalkingSession } from "@/lib/location/location-types";

export const DEFAULT_PLACE_RADIUS_METERS = 250;

export function haversineMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const h =
    s1 * s1 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function metersToMiles(meters: number): number {
  return meters / 1609.344;
}

export function hasGeolocationSupport(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

export function normalizePermissionStatus(code?: number | null): LocationPermissionStatus {
  if (typeof code !== "number") return "unknown";
  if (code === 1) return "denied";
  if (code === 2) return "unavailable";
  if (code === 3) return "timeout";
  return "unknown";
}

export function describeLocationContext(context: LocationContext): string {
  switch (context) {
    case "home":
      return "Home";
    case "school":
      return "School";
    case "work":
      return "Work";
    case "on_the_move":
      return "On the move";
    default:
      return "Unknown";
  }
}

export async function requestCurrentLocation(): Promise<{ status: LocationPermissionStatus; snapshot: LocationSnapshot | null; message: string | null }> {
  if (!hasGeolocationSupport()) {
    return { status: "unavailable", snapshot: null, message: "This device does not support location." };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          status: "granted",
          snapshot: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracyMeters: pos.coords.accuracy ?? 0,
            timestamp: new Date(pos.timestamp).toISOString(),
          },
          message: null,
        });
      },
      (error) => {
        const status = normalizePermissionStatus(error.code);
        resolve({
          status,
          snapshot: null,
          message:
            status === "denied"
              ? "Location permission is blocked. MOVA will continue without live location."
              : status === "timeout"
                ? "Location request timed out. Try again when you have a better signal."
                : "Location is unavailable right now.",
        });
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });
}

export function detectLocationContext(snapshot: LocationSnapshot | null, savedPlaces: SavedPlace[]): LocationContext {
  if (!snapshot) return "unknown";

  let best: SavedPlace | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const saved of savedPlaces) {
    const distance = haversineMeters(snapshot, saved);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = saved;
    }
  }

  if (!best) return "on_the_move";

  const margin = Math.max(snapshot.accuracyMeters, 25);
  if (bestDistance <= best.radiusMeters + margin) {
    return best.label;
  }

  return "on_the_move";
}

// GPS point acceptance result used for debug/observability output.
export type GpsPointDecision = {
  accepted: boolean;
  reason: "first_point" | "moved" | "too_small" | "too_large_jump" | "poor_accuracy" | "duplicate";
};

export type WalkingTrackerStats = {
  acceptedPoints: number;
  rejectedPoints: number;
  lastAccuracyMeters: number | null;
  lastPointAt: string | null;
  lastRejectionReason: GpsPointDecision["reason"] | null;
};

// Filtering constants — tuned so real walking accumulates distance while
// stationary GPS drift and teleport-style noise do not.
const MIN_STEP_METERS = 1.5;          // ignore sub-1.5m jitter (drift while stationary)
const MAX_STEP_METERS = 60;           // ignore impossible jumps between fixes
const MAX_ACCURACY_METERS = 100;      // ignore fixes worse than 100m accuracy

export function startWalkingTracking(
  onUpdate: (snapshot: LocationSnapshot, totalMeters: number, stats: WalkingTrackerStats, decision: GpsPointDecision) => void,
  onError: (message: string) => void,
): { stop: () => void; watchId: number | null } {
  if (!hasGeolocationSupport()) {
    onError("This device does not support GPS tracking.");
    return { stop: () => undefined, watchId: null };
  }

  let lastPoint: LocationSnapshot | null = null;
  let totalMeters = 0;
  let watchId: number | null = null;
  let acceptedPoints = 0;
  let rejectedPoints = 0;
  let lastAccuracyMeters: number | null = null;
  let lastPointAt: string | null = null;
  let lastRejectionReason: GpsPointDecision["reason"] | null = null;

  const stats = (): WalkingTrackerStats => ({
    acceptedPoints,
    rejectedPoints,
    lastAccuracyMeters,
    lastPointAt,
    lastRejectionReason,
  });

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const snapshot: LocationSnapshot = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracyMeters: pos.coords.accuracy ?? 0,
        timestamp: new Date(pos.timestamp).toISOString(),
      };
      lastAccuracyMeters = snapshot.accuracyMeters;
      lastPointAt = snapshot.timestamp;

      let decision: GpsPointDecision = { accepted: false, reason: "first_point" };

      if (lastPoint) {
        const distance = haversineMeters(lastPoint, snapshot);
        const timeGapSec = Math.max(0, (new Date(snapshot.timestamp).getTime() - new Date(lastPoint.timestamp).getTime()) / 1000);
        if (distance < MIN_STEP_METERS) {
          decision = { accepted: false, reason: distance < 0.5 ? "duplicate" : "too_small" };
        } else if (distance > MAX_STEP_METERS) {
          decision = { accepted: false, reason: "too_large_jump" };
        } else if (snapshot.accuracyMeters > MAX_ACCURACY_METERS) {
          decision = { accepted: false, reason: "poor_accuracy" };
        } else if (distance > Math.max(snapshot.accuracyMeters, 10) * 1.5) {
          // Jump larger than the fix's plausible error radius — likely drift noise.
          decision = { accepted: false, reason: "too_large_jump" };
        } else {
          // Clamp each accepted step to a walking-plausible speed so brief noise
          // cannot inject large distances (real walking is < 2.5 m/s).
          const maxPlausible = Math.max(MIN_STEP_METERS, timeGapSec * 2.5);
          totalMeters += Math.min(distance, maxPlausible);
          decision = { accepted: true, reason: "moved" };
        }

        if (decision.accepted) acceptedPoints += 1;
        else {
          rejectedPoints += 1;
          lastRejectionReason = decision.reason;
        }
      } else {
        acceptedPoints += 1;
        decision = { accepted: true, reason: "first_point" };
      }

      lastPoint = snapshot;
      onUpdate(snapshot, totalMeters, stats(), decision);
    },
    (error) => {
      const code = normalizePermissionStatus(error.code);
      if (code === "denied") {
        onError("Location permission was denied while tracking your walk.");
      } else {
        onError("GPS tracking stopped because the browser could not read your location.");
      }
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
  );

  return {
    watchId,
    stop: () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    },
  };
}

export function createWalkingSession(resetId: string, totalMeters: number): WalkingSession {
  const start = new Date().toISOString();
  return {
    id: `${resetId}-walk-${Date.now()}`,
    resetId,
    startedAt: start,
    endedAt: null,
    distanceMeters: totalMeters,
    distanceMiles: metersToMiles(totalMeters),
    status: "active",
  };
}
