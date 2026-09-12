# MOVA Competition Master Brief
## Technical, Product, and Competition Audit

**Product:** MOVA - Move Towards a Healthy Life  
**Repository:** `moment-space-creator`  
**Audit basis:** Current repository implementation, configuration, source comments, and current validation commands  
**Audit date:** 2026-09-12  
**Audience:** Tracy, the competition team, presenters, and technical judges
Demo Link: https://movahealthgh.vercel.app

> This document describes what the current code actually does. It deliberately separates Firebase-backed functionality, deterministic product logic, functional prototypes, demo-only behavior, and unfinished or duplicated paths. The README describes the product vision; this brief is the implementation source of truth.

---

## 1. Executive Position

MOVA is a behavior-aware workplace wellness system that schedules short movement resets, persists the user's reset history, verifies completion through activity-appropriate flows, records private check-ins, and uses deterministic behavioral evidence to improve future recommendations.

The strongest product idea is not the reminder. It is the closed loop:

```text
User context and profile
        |
        v
Deterministic schedule
        |
        v
Due reset and persistent intervention
        |
        v
Activity and verification
        |
        v
Completed reset and private check-in
        |
        v
Analytics and behavioral features
        |
        v
Friction-aware recommendation and future schedule
```

The current implementation is strongest in:

- A real Firebase anonymous identity path when Firebase environment variables are present.
- User-scoped Firestore persistence for profile, settings, resets, check-ins, and saved places.
- A typed reset lifecycle with domain services rather than route-level Firestore calls.
- An in-app persistent intervention mounted at the application root.
- Real browser geolocation and a real GPS distance accumulator when permissions and hardware are available.
- A real camera stream lifecycle with a simulated verification result.
- Evidence-based deterministic behavioral summaries with cold-start thresholds, recency weighting, friction signals, schedule adaptation, exploration, variety, and user-suppressible derived insights.
- An isolated Demo Mode that stores demo state in a dedicated localStorage namespace and does not write demo history into Firebase.

The most important limitations are:

- The core intelligence is deterministic rules and scoring, not a trained machine-learning model or an LLM.
- Browser notifications are triggered by the open application intervention; there is no background service worker scheduler in the repository.
- Camera verification uses real camera permission and preview but the posture result is simulated after a timer.
- There are two location/place implementations: the active Firebase-backed place service and a legacy/demo-only localStorage helper used by the `/places` prototype route.
- There are two repository styles: the active typed repository and a legacy `mova-repo-writes.ts` API with an older `ResetEntry` shape.
- There is no automated test suite or test script in `package.json`.
- Browser, camera, GPS, Firestore-rule deployment, and full competition E2E behavior have not been independently executed in this audit environment.

### MOVA in one sentence

MOVA is a persistent, explainable workplace reset system that learns from what a person actually completes, postpones, and struggles with so the next intervention is more likely to fit.

---

## 2. Repository Audit Scope

The repository was inspected across:

- `src/routes`: all file-based routes, including onboarding, home, reset, verification, check-in, history, insights, learning, profile, privacy, places, walking, scanning, and pause/grace flows.
- `src/components`: the MOVA screen primitives, navigation, cards, buttons, and the root-mounted persistent intervention.
- `src/lib`: authentication, Firebase initialization, cache, domain service, repository, scheduler, activity catalogue, Demo Mode, location, camera, notifications, analytics, intelligence, and error handling.
- `src/types`: Firebase module shims.
- `firestore.rules` and `firestore.indexes.json`.
- `package.json`, `vite.config.ts`, `tsconfig.json`, `.env.example`, `AGENTS.md`, `IMPLEMENTATION_PLAN.md`, and route documentation.
- Search results for TODO/FIXME/mock/fake/simulated/placeholder/hardcoded/fallback/AI/camera/location/notification/analytics/learning/recommendation/schedule/reset/walking/verification/Firebase/Firestore/Auth.

### Current validation evidence

- `npx tsc --noEmit`: passed during the current implementation cycle.
- `npm run build`: passed during the current implementation cycle and generated Vercel/Nitro output.
- `git diff --check`: passed apart from a normal line-ending warning for `src/routes/walk.tsx`.
- `npm run lint`: exists, but a repository-wide run has previously exhausted Node's heap. Treat lint as currently environment-limited rather than as a clean pass.
- Automated tests: no test directory and no test script are present in `package.json`.
- Browser E2E: not independently run in this audit because no browser page was shared.

---

## 3. Product Architecture

### 3.1 Runtime architecture

```text
                         +----------------------+
                         |       User           |
                         | browser/mobile web   |
                         +----------+-----------+
                                    |
                                    v
                         +----------------------+
                         | TanStack Router      |
                         | file-based routes    |
                         +----------+-----------+
                                    |
                                    v
                         +----------------------+
                         | MOVA UI components   |
                         | routes + screens     |
                         +----------+-----------+
                                    |
                                    v
                         +----------------------+
                         | MovaProvider         |
                         | global state/actions  |
                         | hydration/cache      |
                         +----+-------------+---+
                              |             |
                +-------------+             +----------------+
                v                                              v
       +------------------+                         +----------------------+
       | Domain services  |                         | Local/demo adapters  |
       | mova-service     |                         | Demo Mode namespace  |
       | scheduler        |                         | localStorage helpers |
       +--------+---------+                         +----------------------+
                |
                v
       +------------------+
       | Typed repositories|
       | mova-repo         |
       | place service     |
       +--------+---------+
                |
       +--------+------------------------------+
       v                                       v
+----------------------+              +----------------------+
| Firebase Auth        |              | Firestore            |
| anonymous UID        |              | users/{uid}/...     |
+----------------------+              +----------------------+
```

### 3.2 Main ownership boundaries

| Layer | Current responsibility |
|---|---|
| Routes | Render screens, collect user actions, call provider actions. Some older routes still contain prototype UI logic. |
| `MovaProvider` | Auth-aware hydration, cache restore, state mutation actions, location state, walking-session state, Demo Mode adapter. |
| `mova-service.ts` | Onboarding persistence, reset state transitions, verification persistence, grace-period persistence, check-in persistence. |
| `mova-scheduler.ts` | Deterministic slots, adaptive time shift, frequency cap, activity variety, Firestore schedule creation. |
| `mova-repo.ts` | Firestore reads/writes and conversion between Firestore timestamps and typed ISO-string domain objects. |
| `behavior-engine.ts` | Pure derived behavioral features, learning stage, insights, friction, recency, recommendation reasons, schedule-shift calculation, activity ranking. |
| `analytics-engine.ts` | Completion, streak, minutes, walking distance, activity/context/time breakdowns, consistency score, rewards. |
| `mova-demo.ts` | Isolated Jordan persona, seeded demo history, demo transitions, demo reminders, demo analytics and behavior. |
| `location-service.ts` | Browser geolocation, place matching, Haversine distance, GPS tracking. |
| `camera/*` and `scan.tsx` | Camera permission/stream lifecycle and controlled prototype scan. |
| `notification-service.ts` | Browser Notification API wrapper and in-app fallback result. |

### 3.3 Important architectural principle

The intended ownership chain is:

```text
UI action
  -> MovaProvider action
    -> domain service
      -> repository
        -> Firebase Auth / Firestore
```

That architecture is real in the primary path. It is not perfectly uniform because `/places`, `/walk`, `/scan`, and the legacy repository helpers retain prototype-era local or duplicate logic.

---

## 4. Core Product Loop

### 4.1 Understand

**Actual code:** onboarding, `MovaProfile`, saved places, current location context, historical resets, check-ins, and settings.

The user supplies:

- Display name.
- Occupation or custom occupation.
- Work style, with multiple selections.
- Constraints, with multiple selections.
- Break rhythm.

The domain stores profile fields. Location is optional and is requested only when enabled and explicitly refreshed/tracked. A reset can persist the location context known when the reset starts.

**What MOVA knows at cold start:** stated profile/preferences and default settings.  
**What it does not know yet:** reliable completion patterns, timing preference, friction, current activity preference, or context-specific success.

### 4.2 Schedule

**Actual code:** `mova-scheduler.ts` and `buildDailySchedule`.

Cold start uses profile break rhythm to choose default slots:

- Frequent: 09:30, 11:00, 14:00, 15:30, 17:00.
- Moderate: 10:30, 13:00, 15:30.
- Long/unknown: 11:00, 15:00.

Past slots are omitted. IDs are deterministic in the form `sch-{date}-{time}`. On hydration, if today's schedule is absent, the service creates a top-up plan through Firestore.

With enough history, the scheduler uses:

- Bounded learned time shifts, currently at most about 20 minutes.
- Learned frequency limits, capped between 2 and 5 generated slots per day and still constrained by the profile's base slots.
- Activity ranking from behavior.
- Variety: a generated schedule tries not to reuse an activity already selected in that plan.
- A fallback to defaults for new users or detected disruption.

This is adaptive deterministic scheduling, not a predictive ML model.

### 4.3 Remind

The notification service creates typed `Reminder` objects and can call the browser Notification API. The root-mounted `PersistentIntervention` checks the due/active reset state and triggers a browser notification when settings allow it.

If the browser does not support notifications or permission is denied, the outcome is `in_app`; the persistent in-app intervention remains the important product behavior.

There is no repository-level background worker or service-worker scheduling loop. A browser notification is not guaranteed while the app is closed.

### 4.4 Engage

The application-root `PersistentIntervention` is mounted in `src/routes/__root.tsx`, outside individual page routes. It derives its target from persisted reset state, which means navigation and refresh can restore the unresolved intervention when the state has been hydrated.

Inside the application, the active surface deliberately does not offer dismiss, snooze, later, or skip controls. It offers start, required verification, or completion.

The older `/reset` route remains a visual guided-reset/prototype route with a timer and grace action. The root intervention is the stronger current enforcement surface.

### 4.5 Act

Activity definitions come from `mova-activities.ts`. The activity contains instructions, duration, difficulty, category, and verification method. Manual/timed activities can be completed after their required interaction/timing. Camera and distance activities use their specific routes.

### 4.6 Verify

- Manual/timed: completion can proceed through the domain lifecycle.
- Camera: real camera stream access is attempted, then a scan timer produces a controlled successful result. The result calls `verifyReset` and then `completeReset`.
- Walking: browser GPS tracking accumulates distance and the reset is only completed after the minimum target is reached. Demo mode can simulate progress when GPS is unavailable.

The domain service blocks camera completion unless `verificationStatus === "verified"`. Distance completion is wired through the walking flow, but the repository contains both the provider tracker and a route-level tracker, so this area remains a hardening target.

### 4.7 Learn

Completed, skipped, rescheduled, grace, timing, duration, category, context, and check-in signals are converted into analytics and behavior summaries. Learning is derived from raw reset/check-in data rather than an LLM-generated profile.

### 4.8 Adapt

The behavioral engine can produce:

- Learning stage.
- Evidence-backed insight objects.
- Recency-weighted activity/category scores.
- Friction groups.
- Recommendation reasons.
- A preferred time window.
- A bounded schedule shift.
- A frequency estimate.
- A routine-disruption flag.

The scheduler consumes some of these derived signals when a new daily schedule is generated.

---

## 5. User Identity and Persistence

### 5.1 Anonymous Firebase identity

`mova-auth.tsx` uses Firebase anonymous authentication when the required `VITE_FIREBASE_*` variables are configured.

The flow is:

```text
Firebase config present
  -> auth state starts loading
  -> obtain Firebase Auth
  -> if currentUser exists, reuse it
  -> otherwise call signInAnonymously
  -> expose stable UID to MovaProvider
```

The code does not intentionally create a new anonymous account every time. The existing `currentUser` is reused.

If Firebase configuration is absent, auth is `disabled` and the app runs in local-cache mode. That is useful for a local prototype but does not provide a Firebase account.

### 5.2 User document

The user document is stored at:

```text
users/{uid}
```

Fields:

```ts
{
  displayName: string | null,
  email: string | null,
  onboardingCompleted: boolean,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

The name popup in onboarding supplies `displayName`. The final onboarding write sets `onboardingCompleted: true` only after validation and the profile/settings/schedule writes are attempted.

### 5.3 Startup hydration

`MovaProvider` waits for the auth state to resolve, loads a UID-scoped local cache when available, then calls `hydrateUserState` for the authenticated user. Hydration fetches the user document, profile, settings, recent resets, and recent check-ins, then tops up today's schedule if needed.

The intended source-of-truth rule is:

```text
One user
 -> one Firebase UID
 -> one users/{uid} tree
 -> one reset/check-in history
 -> one evolving derived profile
```

LocalStorage is a cache/fallback. Demo LocalStorage is separate and must not be confused with the user cache.

### 5.4 Important startup caveat

The main provider exposes `authReady` when Auth is ready or disabled. The Home route additionally waits for `syncStatus === "loading"`, but the root welcome route and onboarding route primarily use `authReady` and `onboarded`. A returning Firebase user with no warm cache can theoretically see onboarding before the Firestore hydration has finished resolving. This should be fixed before competition by exposing a single hydration-ready route gate, not by changing the identity model.

### 5.5 Incomplete onboarding

The onboarding form validates:

- Occupation.
- Custom occupation when `Other` is selected.
- At least one work-style choice.
- At least one constraint.
- Break rhythm.
- Display name before final submission.

The domain service repeats validation before any writes. A failed save does not intentionally mark onboarding complete or navigate as a successful completion.

### 5.6 Demo isolation

Demo Mode uses the `mova-demo-mode-v1` localStorage key. The demo persona is Jordan. Demo profile, settings, resets, check-ins, saved places, current context, reminders, and walking session are stored in that isolated object. Demo actions call the demo API rather than Firebase services.

The real anonymous Firebase user may still exist in the browser, but Demo Mode does not use that user's Firestore data for demo history and does not write demo resets/check-ins into it.

---

## 6. Firestore Database

### 6.1 Schema

```text
users/{uid}
  profile/main
  settings/main
  resets/{resetId}
  checkins/{checkinId}
  places/{placeId}
```

There is no separate behavioral collection. Behavioral intelligence is derived from reset/check-in/settings data.

### 6.2 `users/{uid}`

Purpose: identity and onboarding state.

Fields: `displayName`, `email`, `onboardingCompleted`, `createdAt`, `updatedAt`.

### 6.3 `profile/main`

Purpose: stated user context and preferences.

Fields:

- `occupation`
- `workStyle[]`
- `constraints[]`
- `breakRhythm`
- `goals[]`
- `movementPreference`
- `preferredActivityTypes[]`
- `typicalLocations[]`
- `updatedAt`

### 6.4 `settings/main`

Purpose: notification, location, camera, privacy, and learning-control settings.

Fields:

- `notificationsEnabled`
- `locationEnabled`
- `cameraVerificationEnabled`
- `preferredReminderStyle`
- `privacy.shareAggregatedWorkplaceData`
- `privacy.allowPersonalization`
- `suppressedInsightIds[]`
- `updatedAt`

### 6.5 `resets/{resetId}`

Purpose: authoritative reset lifecycle and behavioral event source.

Important fields:

```ts
{
  id: string,
  activityId: string,
  status: "scheduled" | "active" | "completed" | "rescheduled" | "skipped",
  scheduledFor: timestamp,
  startedAt: timestamp | null,
  completedAt: timestamp | null,
  verifiedAt: timestamp | null,
  rescheduledAt: timestamp | null,
  rescheduleReason: string | null,
  context: "schedule" | "reschedule" | "manual",
  locationContext?: "home" | "school" | "work" | "unknown" | "on_the_move",
  verificationStatus: string,
  verificationMethod: "manual" | "camera" | "distance" | "timed",
  distanceMeters: number | null,
  graceUntil: timestamp | null,
  graceUsed: boolean,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

`context` is lifecycle context. `locationContext` is the privacy-conscious context captured when a reset starts. They are not the same field.

### 6.6 `checkins/{checkinId}`

Purpose: private post-reset feedback.

Fields: `resetId`, `feeling`, `needs[]`, `createdAt`.

### 6.7 `places/{placeId}`

Purpose: user-saved Home, Work, or School coordinate and radius.

Fields: `label`, `latitude`, `longitude`, `radiusMeters`, `createdAt`, `updatedAt`.

### 6.8 Security

Rules require:

```text
request.auth != null && request.auth.uid == uid
```

for the user document and all explicitly listed subcollections. Everything else is denied by the catch-all rule. The `/places` rule is present and user-scoped.

### 6.9 Indexes

The repository declares:

- A collection-group `resets` index on `scheduledFor ASCENDING`.
- A collection-group `checkins` index on `createdAt DESCENDING`.

### 6.10 Backend answer

Yes, MOVA has a backend when Firebase environment variables are configured: Firebase Authentication supplies identity and Cloud Firestore stores user-scoped application data. Firebase is the backend platform and Firestore is the database. The browser client is still responsible for UI/domain invocation; it is not a custom server API.

When Firebase is not configured, the app is a local prototype using cache-only behavior. That mode should not be presented to judges as the persistent cloud backend.

---

## 7. Onboarding and Personalization

The onboarding flow has four questions followed by the name prompt.

### Required

- Occupation.
- Custom occupation if `Other`.
- One or more work-style selections.
- One or more constraints.
- One break-rhythm selection.
- A non-empty display name.

### Optional or currently unfilled by onboarding

The domain profile supports goals, movement preference, preferred activity types, and typical locations, but the current onboarding form does not populate all of those fields. They remain empty/null unless another flow writes them. The initial activity scheduler therefore relies mostly on occupation, workStyle, constraints, and breakRhythm.

### Stated preference versus observed behavior

**Stated preference** is what the user selects or reports: occupation, work style, constraints, break availability, and any explicit activity preference available in the profile.

**Observed behavior** is what the reset history shows: completed, skipped, rescheduled, grace use, time, duration, category, context, verification, and check-in outcomes.

The behavior engine preserves both. Over time, observed completion and friction affect ranking more strongly than a static stated preference, while the explicit preference remains part of the explanation.

---

## 8. Activity Engine

The structured catalogue in `mova-activities.ts` currently contains these activities:

| Activity | Category | Duration | Verification |
|---|---|---:|---|
| Desk Stretch | stretch | 90 seconds | manual |
| Neck & Shoulder Reset | stretch | 120 seconds | manual |
| Short Walk | walking | 120 seconds | manual in catalogue; distance flow can be used in reset data |
| Standing Reset | movement | 90 seconds | manual |
| Hip Mobility | movement | 120 seconds | manual |
| Deep Breathing | breathing | 90 seconds | timed |
| Grounding Breath | breathing | 120 seconds | timed |
| Full Body Stretch | stretch | 180 seconds | manual |
| Eye Break | recovery | 60 seconds | manual |
| Posture Reset | recovery | 75 seconds | manual |
| Light Movement | movement | 150 seconds | timed |

Each activity has:

- Stable ID.
- Name.
- Category.
- Description.
- Duration.
- Difficulty.
- Verification type.
- Instructions.
- Active flag.
- Static creation/update timestamps.

The catalogue is better than hardcoded UI actions because the scheduler, intervention, history, analytics, and verification flow can refer to the same activity identity.

The current contextual filtering is deterministic. Desk-oriented profiles receive desk-friendly movement/stretch/recovery weighting, walking can be preferred or filtered depending on profile context, and breathing preferences influence scores. Full context suitability is still an evolving rules layer rather than a complete activity safety matrix.

---

## 9. Reset Lifecycle

### Primary states

```text
scheduled -> active -> completed
scheduled -> rescheduled
scheduled -> skipped
scheduled/active -> grace fields updated
active -> verification updated -> completed
```

### Creation

Schedules create typed reset records with deterministic IDs and an activity/verification method. Firebase writes use Firestore timestamps. Local mode writes equivalent objects to the UID-scoped cache.

### Start

`startResetFlow` loads the authoritative reset, requires `status === "scheduled"`, sets `status: "active"`, records `startedAt`, and persists the current location context where available.

### Completion

`completeResetFlow` loads the reset, requires `status === "active"`, blocks camera completion unless the reset is verified, sets `completedAt`, persists the completion, and updates the local cache.

### Reschedule

`rescheduleResetFlow` marks the original reset `rescheduled`, records reason and timestamp, then creates a new scheduled reset with a future timestamp and `context: "reschedule"`.

### Skip

A scheduled reset can be marked `skipped` through the existing service. The persistent active intervention does not expose skip controls. The skip service remains available to other appropriate product contexts and is a behavioral signal.

### Grace

Grace is not a completion state. The reset receives `graceUntil` and `graceUsed`. The real grace duration is ten minutes; Demo Mode uses an accelerated fifteen-second equivalent. One grace period is allowed per reset. The reset remains unresolved and can return to intervention after grace expires.

### Analytics consequences

Only `completed` resets count as completed. Skipped, rescheduled, and grace events remain behavioral friction signals and do not inflate completion metrics.

---

## 10. Unskippable Intervention

### Philosophy

MOVA distinguishes:

```text
Reminder shown != activity completed
Activity started != activity completed
Verification succeeded + completeReset == completed
```

### Actual implementation

`PersistentIntervention` is mounted in the root shell. It watches the current provider reset state and also detects scheduled resets whose `scheduledFor` has passed. It shows a full-screen in-app surface with:

- Time-to-move or escalation copy.
- Activity name and instructions.
- Start action.
- Camera or walking verification action where required.
- Manual/timed completion action after the required interaction.

The surface deliberately omits dismiss, close, skip, snooze, later, and reschedule actions.

### Escalation

The component contains controlled intervals:

- Real mode: first escalation around 15 minutes and stronger persistence around 30 minutes.
- Demo mode: approximately 5 seconds and 10 seconds.

The browser notification is a best-effort reminder. The in-app component is the enforcement surface while MOVA is open.

### Refresh/navigation

Because the reset remains authoritative in provider/cache/Firestore state and the intervention is mounted at root, navigation and refresh can restore it after hydration. A closed browser or killed tab cannot be physically controlled by a web application.

### Grace

The older reset screen exposes the human safety escape phrase, “I can't take the break right now.” That action persists grace, does not complete the reset, and returns the user to Home. Active persistent intervention itself does not show an escape control. This is a product tension the team should explain clearly: grace is an intentional safety/responsibility mechanism, not dismissal or completion.

---

## 11. Location Intelligence

### Real location service

`location-service.ts` uses browser geolocation and requests a one-time current position or starts a watch while tracking. It handles unsupported devices, denied permission, unavailable position, and timeout.

Saved places have:

- Home, Work, or School label.
- Latitude/longitude.
- Configurable radius, default 250 meters.
- Created/updated timestamps.

Context detection uses the Haversine formula and adds the current GPS accuracy as a margin. If the closest saved place is within radius plus accuracy margin, the context is Home, School, or Work. Otherwise it is `on_the_move`; no snapshot produces `unknown`.

### Privacy decisions

The location service is event-driven. It does not implement continuous background GPS. The location snapshot can be held in provider state, and the reset can store only the coarse context label at start. It does not store a raw location history stream in reset documents.

### Important duplicate path

`mova-demo-geo.ts` is a separate demo-only localStorage helper with its own `mova-places-v1` namespace and Haversine function. The `/places` route currently uses this helper instead of the Firebase-backed place service. The team should describe `/places` as a prototype/demo path until it is consolidated.

### Why context matters

A desk stretch may be appropriate at Work, a walking activity may be appropriate when On the move, and a quiet breathing reset may be better at Home. MOVA currently captures enough context to demonstrate this principle, but the complete context-to-activity policy is not yet a fully developed safety rules engine.

---

## 12. Walking Verification

### Provider tracker

`startWalkingTracking` starts a fresh closure with:

- `lastPoint = null`.
- `totalMeters = 0`.
- A browser `watchPosition` subscription.

Each accepted GPS update calculates Haversine distance from the previous point. It ignores distances below 2 meters or above 500 meters and applies an accuracy quality check. The provider writes a `WalkingSession` with reset ID, distance meters, miles, start time, and status.

This means the core tracker starts each new tracker at zero rather than inheriting a previous tracker accumulator.

### Route-level walking prototype

`walk.tsx` also maintains a route-local distance accumulator and opens its own `watchPosition`. In Demo Mode with no GPS it can simulate a short distance and call the Demo completion path. This duplicate route-level tracker is a known hardening issue: the official provider tracker and route-local tracker can both be active in the same route.

### Reset completion

For a distance-verified current reset, the route watches `walkingSession.distanceMeters`. At 100 meters it calls `verifyReset` and then `completeReset`. Demo walking requires an active reset and at least 100 meters before completing through Demo Mode.

### Session contamination answer

The provider's official accumulator is local to each `startWalkingTracking` call, so a new session begins at zero. The route also explicitly clears its session-local refs when the current reset changes or a new start occurs. Daily total miles are not the authoritative reset completion metric in this route; completed reset records and their `distanceMeters` are the durable analytics source.

### Honest limitation

Because the route contains a second tracker and a legacy local geo helper, the team should present the official provider/service path as the intended architecture and identify route-level walking cleanup as a production hardening task.

---

## 13. Camera Verification

### What is real

- Browser capability check.
- `getUserMedia` permission request.
- Front-camera video constraints.
- Local video preview.
- Stream track cleanup on unmount/cancellation.
- Permission-denied and unavailable states.

### What is simulated

`runPrototypeCameraVerification` waits a fixed period and returns a successful result with a confidence value. `scan.tsx` also presents a timed scanning UI. There is no pose-estimation model, frame analysis, uploaded image, or stored camera footage in the repository.

The accurate competition wording is:

> MOVA currently demonstrates a controlled camera-verification prototype designed to validate the permission, preview, scanning, verification, and completion architecture. Production-grade pose estimation is a future hardening step.

### Completion path

The current active reset must be a camera reset. The scan screen calls `verifyReset`, then `completeReset`, and returns Home. Camera completion is blocked by the domain service when verification is not marked verified.

The older `/verify` route is a static verification presentation and has prototype links. The root intervention and `/scan` are the stronger current lifecycle path.

---

## 14. Notifications

The notification service defines:

- Permission status: unknown, granted, denied, unsupported.
- Reminder status: scheduled, triggered, dismissed, opened, completed.
- Browser notification trigger.
- In-app fallback outcome.

The service never treats a browser notification as the source of truth. The reset in Firestore/provider state is the source of truth.

Limitations:

- No service worker or background scheduling system is present.
- Notification delivery is best effort while browser APIs are available.
- OS-level notification dismissal, Do Not Disturb, browser closure, and process termination are outside web-app control.
- The in-app persistent intervention is still available when the user opens MOVA and notification permission is denied.

---

## 15. Behavioral Intelligence

### Pipeline

```text
Raw reset/check-in/settings events
        |
        v
Behavioral features
        |
        v
Learning stage and evidence counts
        |
        v
Insights and friction groups
        |
        v
Activity ranking and schedule adaptation
        |
        v
New reset outcomes
```

### Current signals actually used

- Completed reset count.
- Active days with completed resets.
- Completed/skipped/rescheduled status.
- Grace use.
- Activity ID and category.
- Activity duration range: short, medium, long.
- Scheduled/completed time window: morning, afternoon, evening.
- Persisted location context at reset start.
- Explicit activity preferences from profile where present.
- Check-in count.
- Repetition of the latest activity.
- Recent versus older reset timestamps.
- Repeated skips and friction combinations.

Walking distance is used by analytics and rewards. It is not currently a complete independent behavioral feature in the activity-ranking formula beyond the distance activity's completion status.

### Learning stages

The engine derives:

- `new`
- `observing`
- `early-patterns`
- `personalized`
- `well-understood`

Stage uses completed reset count and active-day diversity. This prevents many completions on one day from being treated as equivalent to sustained behavior over multiple days.

### Confidence

Behavioral insights contain:

- ID.
- Type.
- Statement.
- Evidence count.
- Confidence value.
- First observation timestamp.
- Last observation timestamp.
- Supporting signal labels.

Confidence is deterministic and threshold-based. It is an internal gate, not a claim that a statistical ML model has been trained.

### Cold start

With no meaningful history, completion rate is zero rather than a fabricated percentage. The learning screen says MOVA is still learning. Profile preferences can help select a sensible initial activity, but they are not presented as observed behavior.

---

## 16. Friction Intelligence

The current `BehavioralFriction` model groups friction by:

- Location context, when available.
- Activity category.
- Time window.
- Duration range.
- Evidence count.
- Friction score.
- Confidence.
- Last observed timestamp.

A friction event is created from skip, reschedule, or grace behavior. Repeated groups are retained as friction candidates. The score weights skips more heavily than grace/reschedule and is bounded.

The activity ranker subtracts a friction penalty for a candidate category. This is intentionally narrower than claiming to know why a user dislikes exercise. The evidence means the combination has produced repeated delay or non-completion.

Current limitations:

- Reschedule reasons are stored, but the friction score does not yet deeply classify individual reason text.
- Context is only available for resets where a location context was captured at start.
- Friction is derived in memory from the reset history and is not stored as a separate aggregate document.

---

## 17. Recency and Changing Behavior

Activity/category scoring uses exponential decay with approximately a 21-day decay constant. Recent outcomes influence the score more strongly, while older behavior is not automatically deleted.

The model can therefore change its recommendation when a user's recent behavior shifts. It does not permanently label a person as a “walking user” or “stretching user.”

This is a deterministic recency heuristic, not a trained time-series model.

---

## 18. Exploration and Variety

The ranker includes:

- Completion likelihood from relevant activity history.
- Category completion history.
- Duration fit.
- Explicit preference bonus.
- Exploration bonus for unseen candidates.
- Friction penalty.
- Repetition penalty for the latest activity.

The scheduler tries to select different activities within a generated plan rather than using only `pool[i % pool.length]` when alternatives exist.

There is no explicit user-facing percentage such as 80/20. Exploration is a small deterministic score bonus, and the candidate pool still comes from active, profile-filtered catalogue activities.

Exploration feeds learning because the resulting reset status becomes part of the same raw reset history.

---

## 19. Routine Disruption

The current disruption detector compares recent completed activity with older completed activity. If a user has a meaningful historical active-day baseline but no recent completed days, the engine marks a possible disruption.

It does not claim to know the cause. The scheduler falls back to more conservative/default behavior when disruption is detected, and the product philosophy is to adapt rather than judge.

This is early-stage disruption detection. It does not yet model weekday/weekend baselines, workload changes, or a full location transition model.

---

## 20. Adaptive Scheduling

### Static scheduling

A new user receives profile-based default slots and deterministic activity selection. This is predictable, explainable, and safe for cold start.

### Adaptive scheduling

Once history is sufficient, the scheduler can:

- Shift generated slot times by a bounded amount based on strongest completion window.
- Reduce or cap generated frequency based on average completed resets per active day.
- Prefer activities with stronger recent completion evidence.
- Prefer shorter duration when short resets outperform longer ones.
- Penalize categories with repeated friction.
- Avoid immediate activity repetition.
- Preserve a small exploration path.
- Fall back to defaults when a disruption is detected.

### What it does not yet do

- It does not continuously reschedule a live day every time the user completes a reset.
- It does not use minute-level time windows such as 2:15-2:45; current windows are morning/afternoon/evening with bounded slot shifts.
- It does not dynamically change activity difficulty through a separate learned difficulty model.
- It does not implement an independent intervention-intensity model beyond notification/intervention state and grace.
- It does not use a current GPS context directly inside the schedule planner; context is primarily used at reset start and in derived evidence.

### Competition explanation

> MOVA begins with safe defaults. As it sees repeated completion, delay, grace, and context patterns across multiple days, it can shift future slots and activity ranking within hard limits. The adaptation is deterministic and inspectable, so the system can explain what signal changed the recommendation.

---

## 21. Recommendation Explainability

The behavior summary exposes structured recommendation reasons such as:

- Short resets have stronger completion evidence.
- Afternoon completion history is stronger.
- Repeated delays are being avoided.
- The user's stated preference is included.

Home shows a `Why this one?` block when reasons exist. The learning screen shows the recommendation text and the signals MOVA considered. The insights/learning screens are derived from the same behavior summary rather than separate copy-only claims.

The cold-start recommendation is deliberately cautious:

> We're still learning your rhythm. Keep completing resets and MOVA will start recognizing what fits.

This prevents unsupported statements about a new user's preferences.

---

## 22. What MOVA Learned

The Learning route is the interpretation layer. Analytics answers:

> What did the user do?

Learning answers:

> What cautious pattern can MOVA currently support from those actions?

The Learning screen shows:

- Learning stage title.
- Completed resets and active days.
- Evidence-backed insights.
- Recommendation text.
- Signals considered.
- A later-today explanation.
- A correction button for each visible insight.

Insight suppression is persisted in `settings/main` as `suppressedInsightIds`. Suppressing an insight does not delete resets, check-ins, or raw history. It removes the derived interpretation from the visible/derived recommendation path until future evidence causes a new unsuppressed interpretation to be generated.

The `/insights` route combines raw analytics with the behavior engine. It shows progress, breakdowns, rewards, and a “What MOVA knows” message. It no longer needs to claim a strongest habit when there is insufficient evidence.

---

## 23. Analytics

The analytics engine derives metrics from stored reset/check-in arrays.

| Metric | Actual calculation |
|---|---|
| Completion rate | Completed eligible resets divided by resets whose scheduled time has passed. |
| Total movement minutes | Sum of catalogue duration for completed resets. |
| Walking distance | Sum of `distanceMeters` on completed walking activities. |
| Active days | Unique local calendar dates with completed resets. |
| Current/longest streak | Consecutive completed local dates. |
| Consistency score | Weighted completion rate, active days, current streak, and movement minutes, capped at 100. |
| Activity breakdown | Per-activity completed/skipped/rescheduled counts, completion rate, and completed minutes. |
| Context breakdown | Lifecycle context counts for schedule/reschedule/manual. This is not the same as Home/Work/School location context. |
| Time breakdown | Morning/afternoon/evening completed/skipped counts and rates. |
| Rewards | Derived thresholds from completed count, streak, walking distance, and consistency score. |

Reward `unlockedAt` is calculated at render time rather than persisted as a historical reward event. The reward state is therefore derived, not an immutable achievement ledger.

Check-ins are persisted, but current aggregate analytics use them mainly as inputs to behavior and as raw history; the engine does not yet calculate a rigorous feeling-by-activity causal rate.

---

## 24. Rewards

Current reward definitions include:

- First move: one completion.
- Momentum: three completions.
- Steady rhythm: five completions.
- Consistency streak: three-day streak.
- Walk it out: one kilometre of walking resets.
- Strong rhythm: 75 consistency score.

Rewards are based on actual reset-derived metrics. They are not hardcoded “always unlocked” counters. Demo rewards are derived from seeded Demo history.

---

## 25. Demo Mode

### Persona

Jordan, an anonymous-looking competition persona with a healthcare profile, desk/screen constraints, stated stretch/breathing preferences, and Work context.

### State

Demo state lives in localStorage under `mova-demo-mode-v1` and includes profile, settings, resets, check-ins, saved places, context, reminders, and walking session.

### Seeded history

The seed includes:

- Completed neck/shoulder reset.
- Completed desk stretch.
- Completed short walk with 1,200 meters.
- Completed deep breathing.
- One skipped standing reset.
- One rescheduled hip mobility reset.
- One future scheduled reset.
- Four check-ins across previous days.

This is enough to demonstrate early behavioral evidence rather than a completely empty state.

### Demo controls

Home/Profile expose:

- Enter Demo Mode.
- Select demo context.
- Trigger next reset.
- Reset demo.
- Exit Demo Mode.

Demo escalation uses shortened intervals. Demo walking can simulate progress where GPS is unavailable. Demo camera uses the same scan interaction but remains a controlled prototype.

### Reset/exit guarantee

`resetDemo` recreates only the demo localStorage object. `exitDemoMode` clears the demo object and resets demo UI state. The code does not intentionally delete the real Firebase user document or real user reset history.

### Honest presentation

> Demo Mode accelerates the same domain concepts so judges can observe intervention, verification, analytics, rewards, and behavioral learning in minutes. Its persona and events are controlled demo data and are not evidence from a real participant.

---

## 26. Real versus Prototype Matrix

| Capability | Status | Evidence in code | Competition explanation |
|---|---|---|---|
| Anonymous Firebase identity | REAL when configured | `mova-auth.tsx`, `firebase.ts` | Firebase restores or creates one anonymous UID; no email/password is required. |
| User/profile/settings persistence | REAL Firebase path | `mova-service.ts`, `mova-repo.ts`, rules | User-scoped Firestore documents are the cloud source of truth. |
| Local fallback | FUNCTIONAL FALLBACK | `mova-cache.ts`, disabled auth path | The app remains usable locally when Firebase is unavailable, but local mode is not cloud persistence. |
| Firestore user isolation | REAL rules | `firestore.rules` | Reads/writes require authenticated UID equality. |
| Initial deterministic schedule | REAL | `mova-scheduler.ts` | Profile break rhythm creates deterministic future resets. |
| Adaptive schedule timing | FUNCTIONAL PROTOTYPE | `adaptiveSlotMinutes`, behavior summary | Bounded time/frequency adaptation occurs when future schedules are generated. |
| Persistent intervention | FUNCTIONAL PRODUCT PATH | `persistent-intervention.tsx`, root shell | Due/active resets remain visible in MOVA with no dismiss action. |
| Background alarm while browser closed | NOT IMPLEMENTED | No service worker/background scheduler | Browser notifications cannot guarantee delivery after process shutdown. |
| Browser notification | FUNCTIONAL BROWSER FEATURE | `notification-service.ts` | Best-effort Notification API reminder with in-app fallback. |
| Grace period | REAL DOMAIN FLOW | `activateGracePeriodFlow`, `graceUntil`, `graceUsed` | One ten-minute real grace window; Demo uses accelerated timing. |
| Manual/timed completion | FUNCTIONAL | reset service and intervention | Domain completion transitions active reset to completed. |
| Walking GPS tracking | FUNCTIONAL PROTOTYPE | `location-service.ts`, `walk.tsx` | Real browser GPS and Haversine accumulation with noise filtering. |
| Walking simulation | DEMO | `walk.tsx`, `mova-demo.ts` | Used when GPS is unavailable in Demo Mode. |
| Camera permission/preview | FUNCTIONAL BROWSER FEATURE | `camera-service.ts`, `scan.tsx` | Real `getUserMedia` stream and cleanup. |
| Camera movement/pose detection | SIMULATED | fixed scan timer/prototype verification | The result is controlled; no production pose model is present. |
| Context detection | FUNCTIONAL | Haversine place matching | One-time/current location can map to saved Home/Work/School. |
| Active background location | NOT IMPLEMENTED | No background location service | MOVA does not continuously track GPS. |
| Firebase places | FUNCTIONAL SERVICE, PARTIAL UI INTEGRATION | `mova-repo.ts`, place service | Repository supports cloud places, but `/places` still uses local demo helper. |
| Analytics | REAL DETERMINISTIC DERIVATION | `analytics-engine.ts` | Metrics derive from reset/check-in data. |
| Rewards | REAL DERIVED METRICS | `calculateRewards` | Thresholds use completions, streak, distance, and consistency. |
| Behavioral learning | FUNCTIONAL DETERMINISTIC | `behavior-engine.ts` | Evidence, confidence, friction, recency, and stage logic are implemented. |
| Machine learning model | NOT IMPLEMENTED | No model/provider/training pipeline | The intelligence is explainable rules/scoring, not learned weights from a model. |
| LLM explanation | NOT IMPLEMENTED | No AI provider dependency or API | Copy is generated deterministically from structured signals. |
| User insight correction | FUNCTIONAL | `suppressedInsightIds`, provider action | Derived insight can be suppressed without deleting raw behavior. |
| Demo isolation | FUNCTIONAL | `mova-demo.ts`, namespace | Demo state is local and separate from Firebase writes. |
| Automated tests | NOT IMPLEMENTED | No test script/test directory | Validation currently relies on typecheck/build/manual testing. |
| Production lint | PARTIAL | `npm run lint` | Full run has hit Node heap limits in this environment. |

---

## 27. Competitive Differentiation

### 1. Completion over notification

A normal reminder asks the user to remember. MOVA keeps the active intervention visible inside the application until the reset is completed or an intentional grace/reschedule flow is used.

### 2. Closed-loop behavior

The event does not end at a notification. It becomes a reset record, verification result, check-in, analytic signal, and future scheduling input.

### 3. Friction intelligence

MOVA looks at repeated skip, grace, and reschedule behavior. That is different from merely asking which activity the user likes.

### 4. Context awareness

MOVA can distinguish saved Home, Work, School, and On the move contexts when location permissions and saved places are available.

### 5. Verification architecture

The reset lifecycle is designed to distinguish starting, verifying, and completing. A camera reset cannot be completed through the domain service without verification status.

### 6. Explainability

Recommendation reasons are structured and visible. The system can say that short resets have stronger completion evidence or that repeated delays are being avoided because those signals exist in the model.

### 7. Progressive personalization

New users receive cautious defaults. Evidence across multiple days is required before stronger claims appear.

### 8. User-controlled memory

A user can tell MOVA that an insight is not right without erasing the underlying behavior record.

### 9. Persistent identity

The same anonymous Firebase UID owns the profile and behavioral history across reloads when Firebase persistence/configuration is working.

### 10. Privacy-aware design

No raw camera frames are stored. No continuous background GPS is implemented. Check-ins are user-scoped and intended to remain private from workplace administrators.

### Conceptual comparison

| System | Typical behavior | MOVA distinction |
|---|---|---|
| Alarm/reminder app | Sends a reminder and stops | Maintains an in-app intervention and records the outcome. |
| Calendar reminder | Time-only scheduling | Uses profile, activity, friction, and reset history. |
| Step counter | Measures activity volume | Targets an intervention and verifies a particular reset. |
| Static habit tracker | Logs after the fact | Attempts to change the next intervention based on evidence. |
| Generic wellness app | Broad content library | Connects work context, intervention timing, completion, and privacy-aware verification. |

---

## 28. Why the System Is “AI-Powered”

The technically honest answer is:

> MOVA's core intelligence is behavior-driven personalization. It uses deterministic behavioral features, confidence thresholds, friction scoring, recency weighting, and explainable recommendation rules. There is no current LLM or trained machine-learning provider deciding what the user prefers.

This is a strength for a hackathon explanation because the system does not allow generative text to invent a user profile. A future AI/LLM layer could translate structured evidence into richer explanations, but it should sit on top of the current evidence system rather than replace it.

Use “AI-powered” carefully:

- Accurate: adaptive intervention engine, behavior-aware recommendation, progressive personalization, explainable behavioral intelligence.
- Inaccurate: “an AI model watches the user continuously,” “the model understands personality,” “computer vision verifies every movement,” or “MOVA predicts health outcomes.”

---

## 29. Security and Privacy

### Authentication and isolation

Anonymous Firebase authentication gives each browser user a UID. Firestore rules require the authenticated UID to equal the `{uid}` path segment.

### Data minimization

Stored user data is limited to identity, profile/preferences, reset lifecycle fields, check-ins, saved places, settings, and derived insight suppression IDs.

### Location

MOVA stores saved place coordinates and can store the reset-start location context. It does not store a continuous raw GPS history stream.

### Camera

The camera stream is local to the browser and tracks are stopped during cleanup. The repository contains no camera frame upload or storage pipeline.

### Demo isolation

Demo Mode uses a dedicated localStorage object and does not write demo events to the Firebase user tree.

### Rules caveat

Rules are present in the repository, but they must be deployed to the active Firebase project. A local rules file alone does not change production Firestore behavior.

---

## 30. Failure Modes and Fallbacks

| Failure | Current behavior |
|---|---|
| Firebase env missing | Auth disabled; local cache mode. |
| Auth initialization fails | Auth state becomes error; provider reports sync error and uses cache path. |
| Firestore read/write fails | Provider reports sync error; cache may preserve local state depending on operation. |
| Notification API unavailable | Notification service returns `in_app`; root intervention still exists when app is open. |
| Notification permission denied | Browser notification is not sent; in-app intervention remains the path. |
| Location unsupported/denied | Location error/status is reported; app continues without live context. |
| Camera unsupported/denied | Preview falls back to a demo viewfinder; the scan is explicitly prototype/simulated. |
| GPS unavailable in Demo Mode | Walking demo can simulate controlled progress. |
| Browser refresh during reset | Persisted reset state can restore the root intervention after hydration. |
| Browser closed | The web app cannot enforce an active intervention or guarantee a notification while closed. |
| Incomplete data | Converters apply typed fallbacks; learning stays cautious when evidence is insufficient. |
| Wrong learned insight | User can suppress the derived insight without deleting raw history. |

---

## 31. Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 19 | Component UI and provider state. |
| Language | TypeScript | Strict domain types and compile-time contracts. |
| Framework | TanStack Start | SSR/build integration and application shell. |
| Routing | TanStack Router | File-based routes and navigation. |
| Styling | Tailwind CSS via Lovable Vite config | MOVA visual system and responsive styling. |
| State | React Context plus hooks | `MovaProvider` application state and actions. |
| Backend platform | Firebase | Anonymous Auth and Firestore access. |
| Database | Cloud Firestore | User-scoped persistence. |
| Auth | Firebase Anonymous Auth | Stable no-password UID. |
| Location | Browser Geolocation API | Current position, saved-place context, GPS tracking. |
| Camera | `navigator.mediaDevices.getUserMedia` | Local camera stream for verification prototype. |
| Notifications | Browser Notification API | Best-effort reminder. |
| Analytics | Pure TypeScript engine | Deterministic metrics and rewards. |
| Build | Vite 8, Nitro/Vercel preset | Client/SSR production build. |
| Validation | TypeScript and ESLint scripts | Type/build checks; lint can be memory constrained. |
| Icons | `lucide-react` | UI iconography. |

---

## 32. Project Structure

```text
moment-space-creator/
  firestore.rules
  firestore.indexes.json
  package.json
  vite.config.ts
  tsconfig.json
  .env.example
  IMPLEMENTATION_PLAN.md
  README.md
  src/
    components/
      mova/
        screen.tsx
        persistent-intervention.tsx
      ui/
        ...shared Radix/shadcn-style primitives...
    lib/
      firebase.ts
      mova-auth.tsx
      mova-cache.ts
      mova-demo.ts
      mova-demo-geo.ts
      mova-repo.ts
      mova-repo-writes.ts
      mova-scheduler.ts
      mova-service.ts
      mova-store.tsx
      mova-types.ts
      mova-activities.ts
      analytics/
        analytics-engine.ts
        analytics-types.ts
      intelligence/
        behavior-engine.ts
      location/
        location-service.ts
        location-types.ts
        place-service.ts
      camera/
        camera-service.ts
        camera-types.ts
        verification-service.ts
      notifications/
        notification-service.ts
        notification-types.ts
    routes/
      __root.tsx
      index.tsx
      onboarding.tsx
      reset-profile.tsx
      home.tsx
      reset.tsx
      pause.tsx
      verify.tsx
      scan.tsx
      walk.tsx
      checkin.tsx
      learning.tsx
      insights.tsx
      history.tsx
      library.tsx
      places.tsx
      privacy.tsx
      profile.tsx
```

### Layer responsibilities

- `routes`: page-level flows and presentation.
- `components/mova`: reusable visual primitives and root intervention.
- `mova-store`: application state boundary.
- `mova-service`: domain mutations and persistence sequencing.
- `mova-repo`: Firestore mapping and access.
- `mova-scheduler`: deterministic future schedule creation.
- `behavior-engine`: derived intelligence.
- `analytics-engine`: factual metrics/rewards.
- `location/camera/notifications`: browser capability adapters.
- `mova-demo`: isolated competition control source.

---

## 33. Technical Story for Judges

### Do you have a backend?

Yes, when configured. Firebase Authentication provides anonymous identity and Cloud Firestore stores user-scoped profile, settings, resets, check-ins, and places. The app also has a local cache fallback for offline or unconfigured development.

### What database are you using?

Cloud Firestore. Documents are stored under `users/{uid}` with profile, settings, resets, check-ins, and places subcollections.

### Where is the AI?

The current intelligence is deterministic and evidence-driven. The behavioral engine measures completion, delay, grace, time, duration, activity, context, repetition, recency, and disruption. There is no current LLM provider deciding user behavior.

### How does it learn?

Every completed, skipped, rescheduled, grace, verification, and check-in event remains in the user history. The engine derives evidence and confidence from those events. Stronger patterns require multiple meaningful completions across multiple days.

### How does it personalize?

It begins with stated work profile information and safe default slots. With enough evidence, it can rank activities, favor successful durations, shift future slots within bounds, cap frequency, penalize friction, avoid immediate repetition, and keep exploring suitable alternatives.

### How does it know the user?

Firebase Anonymous Auth gives the browser a stable UID. That UID links the user document, profile, settings, resets, check-ins, and places. The product does not require email/password for the current flow.

### How do you verify completion?

The reset lifecycle separates active, verified, and completed. Camera resets require verification status before domain completion. Walking resets require a distance threshold. Manual/timed activities use the existing completion interaction.

### Why Firebase?

It provides a fast, well-supported anonymous identity and user-scoped Firestore backend suitable for a hackathon product without building an API and database administration layer from scratch.

### Why Firestore?

MOVA's data is naturally user-scoped and document-oriented: one user document plus profile/settings and event-like reset/check-in documents. It also supports timestamped history and security rules directly on the user path.

### Why location?

Context changes what is practical. A desk reset can fit at Work; a walk may fit when On the move; a quieter reset can fit at Home. MOVA uses saved-place matching rather than continuous surveillance.

### Why camera?

Camera verification demonstrates how a higher-friction activity can have a least-invasive verification interaction. The current result is simulated; production pose estimation is future work.

### How do you protect privacy?

The app uses anonymous UID-scoped data, denies cross-user Firestore access, does not store camera frames, does not implement continuous background GPS, and keeps check-ins in the user's private subtree.

### What happens when the user says no to permissions?

Notification denial falls back to in-app intervention. Location denial disables live location but leaves the reset product usable. Camera denial shows the prototype fallback and should be handled according to the activity's verification policy.

### What makes this different from a reminder app?

The reminder is only the start. MOVA keeps the reset in a lifecycle, asks the user to perform the activity, verifies it where required, records how it felt, and uses the result to influence future interventions.

### What is actually AI?

Behavior-driven deterministic personalization. The system intentionally avoids allowing a generative model to invent behavioral conclusions. A future model could explain structured signals, but the structured engine remains the source of truth.

### What is simulated?

Camera movement detection is simulated after a scan timer. Demo history, Demo persona, Demo timing, and no-GPS walking progress are controlled demo data. Browser notification and GPS behavior are real browser APIs when available.

### What would you build next?

Consolidate the two place/walking paths, add automated unit and browser tests, add a background-capable notification strategy where platform constraints allow it, replace camera simulation with privacy-preserving on-device pose estimation, and improve adaptive scheduling with finer time/context models.

---

## 34. Judge Questions and Answers

### Product

**1. What problem are you solving?**  
Long, uninterrupted work periods create physical strain, fatigue, and stress, but ordinary reminders are easy to ignore. MOVA turns a reminder into a guided, verifiable reset loop.

**2. Who is the user?**  
People whose work makes breaks difficult or irregular: healthcare workers, desk workers, students, drivers, customer-facing staff, and other workers with context-specific constraints.

**3. Why does this matter?**  
The product targets the gap between knowing that breaks matter and actually completing one at a realistic moment.

**4. Why not just use a calendar?**  
A calendar knows a time. MOVA knows the reset activity, lifecycle, verification method, friction history, and outcome.

**5. Why not just use a step counter?**  
A step counter reports activity. MOVA creates an intervention, asks for follow-through, and connects the result to future scheduling.

### Innovation and AI

**6. What is new here?**  
The combination of persistent intervention, verification, friction-aware learning, context, and user-controlled derived memory in one workplace reset loop.

**7. Is the AI actually real?**  
The current intelligence is real deterministic software, not a fake LLM claim. It computes evidence-based behavior signals and adapts recommendations through explicit scoring rules.

**8. Why not use an LLM?**  
An LLM should not invent a health or behavior profile. We keep structured behavior as the source of truth and can add generative explanation later.

**9. What prevents hallucinated insights?**  
Cold-start thresholds, active-day requirements, evidence counts, confidence gates, and cautious copy prevent strong claims without repeated behavior.

**10. Does MOVA train a machine-learning model?**  
Not in the current repository. It uses deterministic, explainable scoring and recency decay. That is deliberate for traceability and the current prototype scope.

**11. How can the system change its mind?**  
Recent behavior receives greater weight through decay, and older behavior remains available without permanently defining the user.

**12. What does confidence mean?**  
It is a deterministic internal measure combining evidence count, temporal diversity, and observed rate. It is used to decide whether an insight is ready to show.

### Technical architecture

**13. What is the architecture?**  
Routes render UI, `MovaProvider` owns state/actions, domain services own transitions, repositories own Firestore mapping, and Firebase owns identity/persistence.

**14. What happens offline?**  
When Firebase is absent or a local fallback is used, UID-scoped localStorage preserves cacheable state. Cloud persistence is unavailable in that mode.

**15. How do you prevent duplicate users?**  
The app checks Firebase `currentUser` and reuses it; anonymous sign-in is only called when no user exists.

**16. How do you prevent duplicate schedules?**  
Schedule IDs are deterministic and hydration checks existing reset IDs/day data before inserting planned resets.

**17. How do you secure the database?**  
Firestore rules require an authenticated request UID to equal the user path UID, with explicit rules for profile, settings, resets, check-ins, and places.

**18. What is the source of truth?**  
Firebase Auth/Firestore in configured production mode; localStorage is a cache/fallback. The reset lifecycle is authoritative for completion.

### Personalization and scheduling

**19. How does adaptive scheduling work?**  
New users get profile-based slots. Mature evidence can shift future slots by bounded minutes, limit frequency, change activity ranking, penalize friction, and avoid immediate repetition.

**20. How does it detect friction?**  
It groups repeated skip, grace, and reschedule events by activity category, time window, duration range, and available location context.

**21. Does one skipped reset change the schedule?**  
No. The engine requires repeated evidence and temporal diversity before showing strong insights or applying mature adaptation.

**22. How do explicit preferences and behavior interact?**  
Explicit preferences contribute a bonus, but repeated observed completion and friction increasingly influence the score. The two signals are retained rather than conflated.

**23. How do you avoid repetition?**  
The ranker applies an immediate repetition penalty and the scheduler selects distinct activities within a generated plan when candidates permit.

**24. How do you explore?**  
Unseen suitable activities receive a small exploration bonus. Their subsequent completion or failure returns to the same raw reset history.

**25. What does routine disruption mean?**  
A meaningful historical baseline exists but recent completed activity drops away. MOVA flags a possible change without asserting why.

### Verification and privacy

**26. How do you know a user actually moved?**  
For walking, GPS distance is accumulated with distance and accuracy filters. For camera, the current project demonstrates the interaction and lifecycle, but the actual movement result is simulated.

**27. Is camera verification production computer vision?**  
No. The browser camera stream is real; the posture verification result is a controlled prototype.

**28. Do you store camera footage?**  
No camera upload or frame-storage path exists. Streams are stopped during cleanup.

**29. Are you tracking location continuously?**  
No. Location is requested for current context or while the user explicitly starts walking/tracking. There is no background GPS service.

**30. What happens if permissions are blocked?**  
The app reports the capability failure and uses the strongest remaining in-app/demo path. Notification permission is not the source of reset state.

### Product limitations and scale

**31. What is not finished?**  
Production pose estimation, automated tests, background notification delivery, consolidated location UI, and a single walking tracker path need hardening.

**32. Can this support 100,000 users?**  
The user-scoped Firestore model and anonymous Auth are a reasonable foundation, but production scale would require operational monitoring, cost/index review, rate limits, stronger observability, and tested query boundaries.

**33. What would you test next?**  
Pure behavior-engine tests, service transition tests, Firestore emulator rules tests, and Playwright browser flows for onboarding, refresh, intervention, camera fallback, walking, and Demo Mode.

**34. Who could pay for MOVA?**  
Potential buyers include employers, occupational wellbeing programs, universities, and workforce health partners. The current repository does not implement billing or administrator features.

**35. What impact do you expect?**  
The measurable product loop is completed resets, active days, reduced friction, and better-fit interventions. The current project does not claim clinical outcomes.

**36. Why should judges choose MOVA?**  
Because it treats the hard part as follow-through. It learns from what the user actually does and does not do, rather than stopping at a notification.

---

## 35. Recommended Competition Narrative

### 60-second version

“MOVA is a workplace wellness companion for people who struggle to take breaks at realistic moments. A new user tells us about their workday and constraints. MOVA creates a safe deterministic schedule and chooses an appropriate reset. When the reset is due, MOVA does not simply send a reminder and disappear. It opens a persistent intervention, guides the activity, verifies completion where appropriate, records a private check-in, and feeds that outcome back into the next recommendation. Over time, MOVA learns which durations, activities, time windows, and contexts actually work for that person. The intelligence is evidence-driven and explainable, not an LLM inventing a profile.”

### Demo sequence

1. Enter Demo Mode and point out that the persona is isolated.
2. Show Jordan's seeded completed, skipped, rescheduled, walking, and check-in history.
3. Set Work context.
4. Trigger the next reset.
5. Show the in-app persistent intervention and no dismiss path.
6. Start the activity.
7. Show camera or walking prototype honestly as verification architecture.
8. Complete the reset through the domain lifecycle.
9. Open Insights/Learning and show the evidence-backed reason.
10. Explain that real users start in a colder state and need repeated days before stronger adaptations appear.
11. Reset Demo Mode to prove the real Firebase user is untouched.

### Phrases to use

- “The reset is the source of truth, not the notification.”
- “We distinguish what the user says from what their behavior demonstrates.”
- “MOVA learns friction as well as preference.”
- “The system earns the right to make stronger claims.”
- “Demo Mode accelerates the same domain loop with isolated controlled data.”

### Phrases to avoid

- “The AI continuously watches the user.”
- “Our computer vision proves every movement.”
- “The model understands the user's personality.”
- “The browser can force the user to comply.”
- “We have clinical or medical efficacy evidence.”

---

## 36. Audit Notes

### Confirmed working in code

- Typed activity catalogue.
- Firebase configuration from `VITE_*` environment variables.
- Anonymous Auth reuse/sign-in path.
- Root provider and route architecture.
- User-scoped Firestore repository.
- Firestore rules for user/profile/settings/resets/check-ins/places.
- Local cache namespaced by UID.
- Onboarding validation and domain-level validation.
- Profile/settings/user persistence sequence.
- Reset lifecycle service transitions.
- Grace fields and one-grace guard.
- Root-mounted persistent intervention.
- Browser notification wrapper.
- Haversine context detection.
- Provider GPS accumulator with filtering.
- Camera stream acquisition and cleanup.
- Deterministic analytics and rewards.
- Evidence-based learning stages and insights.
- Friction and recency scoring.
- Adaptive future schedule generation.
- Insight suppression without raw-history deletion.
- Isolated Demo Mode and reset/exit APIs.
- TypeScript and production build validation.

### Partially working or needs testing

- Auth hydration route gating should use one explicit hydration-ready state to eliminate any possibility of onboarding flash.
- Active intervention behavior needs real browser refresh/navigation testing.
- Firestore rules need deployment verification in the actual Firebase project.
- Camera completion needs browser permission testing and should be integrated with a real pose model before production claims.
- Walking needs one authoritative tracker; route-level and provider-level trackers should be consolidated.
- `/places` should use the Firebase-backed place service instead of the legacy local demo helper.
- Demo and normal Home data switching should be tested after entering/exiting Demo Mode without a full reload.
- Adaptive scheduling should be tested with synthetic histories and browser-visible next-reset changes.
- User insight suppression should be tested through reload and Firebase hydration.

### Prototype/demo

- Camera movement result.
- Demo persona and seeded history.
- Demo accelerated timing.
- Demo no-GPS walking simulation.
- Static `/verify` presentation.
- `/places` localStorage route.
- Route-level walking UI accumulator.

### Simulated or not implemented

- LLM or external generative AI.
- Trained machine-learning model.
- Production pose estimation.
- Background web push/service-worker alarm enforcement.
- Continuous background GPS.
- Clinical outcome measurement.
- Billing, employer administration, workplace dashboards, or multi-user organization features.
- Automated test suite.

### Risk list before competition

1. Deploy and verify Firestore rules in the real project.
2. Test anonymous Auth persistence in a fresh browser and after close/reopen.
3. Test root intervention after refresh with scheduled and active resets.
4. Run camera and walking flows on the actual presentation hardware.
5. Consolidate duplicate walking/place implementations or clearly label the prototype paths.
6. Add pure unit tests for analytics, behavior thresholds, friction, adaptive slots, and rank ordering.
7. Add browser tests for onboarding, intervention, verification, grace, Demo Mode, and reset Demo.
8. Resolve the full lint heap issue or run ESLint by source directory with increased Node heap.
9. Confirm that the deployed bundle contains current rules/config and no stale prototype route assumptions.
10. Prepare a short honest explanation of camera simulation and browser notification limitations.

---

## 37. Final Executive Summary

### MOVA in one sentence

MOVA is a persistent, evidence-driven movement reset system that learns why a user completes, postpones, or skips an intervention and uses that evidence to make the next reset more realistic.

### The problem

People know they should move and rest during demanding workdays, but fixed reminders do not account for safety constraints, work context, real availability, or the friction that caused the previous reminder to fail.

### The solution

MOVA connects profile context, deterministic scheduling, persistent intervention, activity guidance, verification, private check-ins, analytics, and progressive behavioral adaptation.

### The core loop

```text
Understand
 -> Schedule
 -> Remind
 -> Engage
 -> Act
 -> Verify
 -> Complete
 -> Learn
 -> Adapt
```

### The differentiator

MOVA is designed around follow-through, not notification volume. A reminder is not a completion event. Completion is a verified domain transition backed by stored reset history.

### The AI story

The current system is behavior-driven deterministic intelligence. It does not use an LLM to invent conclusions. It earns stronger personalization through evidence, confidence, recency, friction, variety, and user correction.

### The technical architecture

React and TanStack Start provide the UI and routes. `MovaProvider` owns application state. Domain services own transitions. Typed repositories map Firestore. Firebase Anonymous Auth supplies identity. Firestore stores the user-scoped history. LocalStorage provides cache/demo fallback.

### The strongest demo moment

A judge triggers a reset, sees a persistent intervention with no dismiss action, starts the activity, completes the verification flow, then opens Learning/Insights and sees a recommendation explanation tied to actual seeded behavior. Reset Demo proves that competition data is isolated.

### The biggest competitive advantage

MOVA models friction as well as preference. It does not only ask, “What activity might the user like?” It also asks, “What combination of time, context, duration, and activity repeatedly prevents follow-through?”

### Current limitations

Camera verification is a controlled prototype. Background browser enforcement is not possible in the current architecture. Walking and places contain legacy/demo duplicates. There is no automated test suite, and browser/device E2E still needs to be executed on presentation hardware.

### Future direction

The next production steps are consolidation, automated testing, real on-device camera verification, stronger background-capable notification design, finer time/context models, and operational hardening of the Firebase deployment.

MOVA is not another system that tells people to move. In its current implementation, it is a system that records what happens after the reminder, distinguishes completion from intention, learns where friction appears, and uses grounded evidence to make the next intervention more likely to succeed.
