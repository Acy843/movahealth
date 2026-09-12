import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Footprints, MapPin } from "lucide-react";
import { FrostCard, MovaScreen, PrimaryButton, ScreenHeader } from "@/components/mova/screen";
import { describeLocationContext } from "@/lib/location/location-service";
import { useMova } from "@/lib/mova-store";
import { getActivity } from "@/lib/mova-activities";

export const Route = createFileRoute("/walk")({
  head: () => ({
    meta: [
      { title: "Walk & location | MOVA" },
      { name: "description", content: "Walking tracker with GPS. Session starts fresh each time." },
    ],
  }),
  component: WalkScreen,
});

const REQUIRED_DISTANCE_METERS = 1609.344; // 1 mile

function WalkScreen() {
  const navigate = useNavigate();
  const { 
    currentReset, 
    walkingSession, 
    startWalkingSession, 
    stopWalkingSession, 
    verifyReset, 
    completeReset, 
    locationError, 
    demoActive, 
    demo,
    currentLocationContext
  } = useMova();
  
  const [goalReached, setGoalReached] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [err, setErr] = useState("");

  const activity = currentReset ? getActivity(currentReset.activityId) : null;
  const isDistanceVerification = currentReset?.verificationMethod === "distance";

  useEffect(() => {
    if (!isDistanceVerification || !walkingSession || completing) return;
    
    if (walkingSession.distanceMeters >= REQUIRED_DISTANCE_METERS && !goalReached) {
      setGoalReached(true);
      setCompleting(true);
      
      void (async () => {
        stopWalkingSession();
        if (demoActive) {
          demo.completeDemoWalking(currentReset.id, walkingSession.distanceMeters);
        }
        
        const verified = await verifyReset(currentReset.id, {
          status: "verified",
          method: "distance",
          message: "Walking target reached.",
          distanceMeters: walkingSession.distanceMeters,
        });
        
        if (verified) {
          await completeReset(currentReset.id);
          navigate({ to: "/home" });
        }
        setCompleting(false);
      })();
    }
  }, [isDistanceVerification, walkingSession?.distanceMeters, goalReached, completing, stopWalkingSession, verifyReset, completeReset, currentReset, navigate, demoActive, demo]);

  const start = useCallback(() => {
    setErr("");
    setGoalReached(false);
    
    if (!navigator.geolocation && !demoActive) {
      setErr("This device has no GPS.");
      return;
    }

    if (currentReset) {
      startWalkingSession(currentReset.id);
    }
  }, [currentReset, startWalkingSession, demoActive]);

  const stop = useCallback(() => {
    stopWalkingSession();
    if (demoActive && currentReset && walkingSession) {
      demo.completeDemoWalking(currentReset.id, walkingSession.distanceMeters);
    }
  }, [stopWalkingSession, demoActive, currentReset, walkingSession, demo]);

  const tracking = walkingSession?.status === "active";
  const sessionmiles = walkingSession?.distanceMiles ?? 0;
  const place = describeLocationContext(currentLocationContext);

  return (
    <MovaScreen withNav={false}>
      <ScreenHeader
        eyebrow="Walking verification"
        title={activity?.name ?? "Walk & place"}
        subtitle={isDistanceVerification ? "Keep walking until MOVA records the required distance." : "Session starts fresh each time you start."}
      />
      <FrostCard className="mt-6 p-5 text-center">
        <Footprints className="mx-auto size-6 text-sagedeep" strokeWidth={1.75} />
        <p className="mt-2 font-display text-[44px] font-bold text-ink">{sessionmiles.toFixed(2)}</p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-soft">
          session miles
        </p>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[12.5px] text-soft">
          <MapPin className="size-3.5" /> {place}
        </p>
        
        {tracking && isDistanceVerification && !goalReached && (
          <div className="mt-4 px-2">
            <p className="text-[10px] text-soft mb-1">
              {Math.round(walkingSession.distanceMeters)}m / {REQUIRED_DISTANCE_METERS}m
            </p>
            <div className="h-1.5 w-full bg-mist rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-sage to-sky transition-all duration-500" 
                style={{ width: `${Math.min(100, (walkingSession.distanceMeters / REQUIRED_DISTANCE_METERS) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {goalReached && (
          <p className="mt-4 text-[12px] font-medium text-sagedeep">Goal reached! Completing reset...</p>
        )}
        {(err || locationError) && <p className="mt-4 text-[12px] text-soft">{err || locationError}</p>}
      </FrostCard>
      
      <div className="mt-4 flex flex-col gap-3">
        {!tracking ? (
          <PrimaryButton onClick={start}>
            Start walk
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={stop} disabled={completing}>
            {completing ? "Completing..." : "Walking in progress (Stop)"}
          </PrimaryButton>
        )}
        
        {demoActive && !tracking && !goalReached && (
          <button 
            type="button"
            className="rounded-2xl bg-sagedeep/10 px-5 py-3 text-[14px] font-semibold text-sagedeep transition-all hover:bg-sagedeep/20"
            onClick={async () => {
              if (!currentReset) return;
              setCompleting(true);
              setGoalReached(true);
              demo.completeDemoWalking(currentReset.id, REQUIRED_DISTANCE_METERS);
              const verified = await verifyReset(currentReset.id, {
                status: "verified",
                method: "distance",
                message: "Walking target reached.",
                distanceMeters: REQUIRED_DISTANCE_METERS,
              });
              if (verified) {
                await completeReset(currentReset.id);
                navigate({ to: "/home" });
              }
              setCompleting(false);
            }}
          >
            Simulate 1 Mile Walk
          </button>
        )}
      </div>
      
      <FrostCard soft className="mt-4 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-soft">How it works</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-soft">
          {isDistanceVerification
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
