import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { Footprints, MapPin } from "lucide-react";
import { FrostCard, MovaScreen, PrimaryButton, ScreenHeader } from "@/components/mova/screen";
import { haversineMeters, loadPlaces } from "@/lib/mova-demo-geo";
import { nearestPlace } from "@/lib/mova-demo-geo";
import { useMova } from "@/lib/mova-store";

export const Route = createFileRoute("/walk")({
  head: () => ({
    meta: [
      { title: "Walk & location | MOVA" },
      { name: "description", content: "Walking tracker with GPS. Session starts fresh each time. Miles come from completed walks." },
    ],
  }),
  component: WalkScreen,
});

function WalkScreen() {
  const { currentReset, walkingSession, startWalkingSession, stopWalkingSession, verifyReset, completeReset, locationError, demoActive, demo } = useMova();
  const [sessionmiles, setSessionmiles] = useState(0);
  const [tracking, setTracking] = useState(false);
  const [place, setPlace] = useState("Unknown");
  const [err, setErr] = useState("");
  const [goalReached, setGoalReached] = useState(false);
  const watchId = useRef<number | null>(null);
  const last = useRef<{ lat: number; lon: number } | null>(null);
  const sessionDistanceRef = useRef(0);

  useEffect(() => {
    if (currentReset?.verificationMethod === "distance") {
      setSessionmiles(0);
      sessionDistanceRef.current = 0;
      setGoalReached(false);
      setTracking(false);
    }
  }, [currentReset?.id, currentReset?.verificationMethod]);

  useEffect(() => {
    if (currentReset?.verificationMethod !== "distance" || !walkingSession || walkingSession.distanceMeters < 100) return;
    setGoalReached(true);
    void (async () => {
      stopWalkingSession();
      const verified = await verifyReset(currentReset.id, {
        status: "verified",
        method: "distance",
        message: "Walking target reached.",
      });
      if (verified) await completeReset(currentReset.id);
    })();
  }, [completeReset, currentReset, stopWalkingSession, verifyReset, walkingSession]);

  useEffect(() => {
    return () => {
      if (watchId.current != null) navigator.geolocation?.clearWatch(watchId.current);
    };
  }, []);

  const saveSessionDistance = useCallback((distanceMeters: number) => {
    if (!currentReset || currentReset.verificationMethod !== "distance") return;
    if (demoActive) {
      demo.completeDemoWalking(currentReset.id, distanceMeters);
    }
  }, [currentReset, demoActive, demo]);

  const start = useCallback(() => {
    setErr("");
    if (!navigator.geolocation) {
      setErr("This device has no GPS. Demo still works.");
      if (demoActive && currentReset?.verificationMethod === "distance") {
        setSessionmiles(0.35);
        sessionDistanceRef.current = 0.35 * 1609.344;
        setGoalReached(true);
        saveSessionDistance(sessionDistanceRef.current);
      }
      return;
    }
    last.current = null;
    sessionDistanceRef.current = 0;
    setSessionmiles(0);
    setGoalReached(false);

    if (currentReset?.verificationMethod === "distance") {
      const session = startWalkingSession(currentReset.id);
      if (!session) return;
    }
    setTracking(true);

    const onUpdate = (pos: GeolocationPosition) => {
      const cur = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      const places = loadPlaces();
      const near = nearestPlace(cur, places, 250);
      setPlace(near ? near.label : "On the move");

      if (last.current) {
        const d = haversineMeters(last.current, cur);
        if (d > 2 && d < 500) {
          sessionDistanceRef.current += d;
          setSessionmiles(sessionDistanceRef.current / 1609.344);

          if (currentReset?.verificationMethod === "distance" && sessionDistanceRef.current >= 100 && !goalReached) {
            setGoalReached(true);
            saveSessionDistance(sessionDistanceRef.current);
          }
        }
      }
      last.current = cur;
    };

    const onError = () => {
      setErr("Location blocked. Allow it for live tracking, or use demo mode.");
      setTracking(false);
    };

    watchId.current = navigator.geolocation.watchPosition(
      onUpdate,
      onError,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }, [currentReset, demoActive, goalReached, loadPlaces, nearestPlace, saveSessionDistance, startWalkingSession]);

  const stop = useCallback(() => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setTracking(false);
    if (currentReset?.verificationMethod === "distance" && sessionDistanceRef.current > 0) {
      saveSessionDistance(sessionDistanceRef.current);
    }
  }, [currentReset, saveSessionDistance]);

  return (
    <MovaScreen withNav={false}>
      <ScreenHeader
        eyebrow="Walking verification"
        title="Walk & place"
        subtitle={currentReset?.verificationMethod === "distance" ? "Keep walking until MOVA records the required distance." : "Session starts fresh each time you start."}
      />
      <FrostCard className="mt-6 p-5 text-center">
        <Footprints className="mx-auto size-6 text-sagedeep" strokeWidth={1.75} />
        <p className="mt-2 font-display text-[44px] font-bold text-ink">{sessionmiles.toFixed(2)}</p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-soft">
          {currentReset?.verificationMethod === "distance" ? "session miles" : "miles this session"}
        </p>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[12.5px] text-soft">
          <MapPin className="size-3.5" /> {place}
        </p>
        {goalReached && (
          <p className="mt-2 text-[12px] font-medium text-sagedeep">Goal reached!</p>
        )}
        {(err || locationError) && <p className="mt-2 text-[12px] text-soft">{err || locationError}</p>}
      </FrostCard>
      <div className="mt-4">
        {!tracking ? (
          <PrimaryButton onClick={start}>
            {demoActive && !navigator.geolocation ? "Simulate walk" : "Start walk"}
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={stop}>Walking in progress</PrimaryButton>
        )}
      </div>
      <FrostCard soft className="mt-4 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-soft">How it works</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-soft">
          {currentReset?.verificationMethod === "distance"
            ? "Each walking session starts at 0. Complete the distance to verify this reset. Your total walking distance is calculated from all completed walks."
            : "Each walk session starts fresh. Your total comes from completed walks, not this live tracker."}
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-soft">
          {demoActive && "This is a demo walking session. Distance is simulated and tracked separately from real walks."}
        </p>
      </FrostCard>
    </MovaScreen>
  );
}
