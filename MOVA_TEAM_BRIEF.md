# MOVA Team Brief

**Demo website:** https://movahealthgh.vercel.app

## What Is MOVA?

MOVA is a wellness app that helps people take short movement and recovery breaks during a busy workday.

Many people sit, stand, work, study, or stay focused for long periods without taking a break. MOVA helps them pause before stress and tiredness build up.

MOVA is designed to feel like a calm companion, not a loud alarm or a fitness competition.

## The Main Idea

MOVA does more than send a reminder.

```text
Learn about the user
        ↓
Suggest a suitable reset
        ↓
Remind the user
        ↓
Guide the activity
        ↓
Check that it was completed
        ↓
Learn from what happened
        ↓
Improve the next suggestion
```

The important difference is that MOVA pays attention to what the user actually does. It can learn which activities, times, and situations work best for that person.

## Who Is It For?

MOVA can help:

- Healthcare workers
- Office workers
- Students
- Drivers
- Teachers
- Retail and customer-service workers
- Anyone who has long or difficult work periods

The app is especially useful for people who cannot always take a break at the same time every day.

## Main Features

### 1. Simple onboarding

The user tells MOVA:

- Their name
- Their occupation
- What their workday is like
- Their work constraints
- When they usually take breaks

This helps MOVA avoid suggesting activities that do not fit the user's situation.

### 2. Personalized reset schedule

MOVA suggests short resets based on the user's workday and break rhythm.

Examples include:

- A desk stretch
- A neck and shoulder reset
- Standing movement
- Deep breathing
- A short walk
- Eye recovery
- Hip mobility

New users start with sensible default suggestions. As the user completes more resets, MOVA can adjust future activities and timing.

### 3. Persistent movement intervention

When a reset is due, MOVA shows a strong in-app intervention.

It does not simply show a reminder and disappear. The user is guided to start the activity and complete it.

Inside MOVA, the active intervention does not offer normal dismiss, skip, snooze, or close controls. The reset remains active until the activity is completed or the user uses the separate safety/grace option.

A browser or phone operating system can still close the app or block notifications. MOVA cannot control the operating system.

### 4. Grace period

Sometimes a user is with a patient, in a meeting, driving, or doing something unsafe to interrupt.

MOVA provides an option such as:

> I can't take the break right now

The user can take a short grace period. This does not count as completing the reset. The reset remains part of the user's history and can return later.

### 5. Verification

MOVA uses different completion methods depending on the activity.

- Manual or timed resets can be completed through the reset flow.
- Walking resets use GPS distance tracking.
- Camera resets first go through the verification step inside MOVA. From there, MOVA opens its camera scanning screen for the check.

The camera scanning screen is not a separate product feature that users need to find on their own. It is part of the verification flow after a camera-based reset has started.

The camera feature currently demonstrates the verification experience with a controlled prototype scan. It is not yet production-level pose-detection software.

The flow is:

```text
Start camera reset
        ↓
Verification step inside MOVA
        ↓
Camera scan
        ↓
Verification result
        ↓
Reset completed
```

### 6. Walking tracking

When a walking reset starts, MOVA begins a fresh session at zero.

It uses browser GPS points to estimate distance. It filters out very small movements and unreasonable jumps caused by GPS noise.

In Demo Mode, walking progress can be simulated when GPS is not available.

### 7. Location context

Users can save places such as:

- Home
- Work
- School

MOVA can use the current browser location to estimate whether the user is at one of those places or on the move.

This can help the app choose a more suitable activity. For example, a desk stretch may fit at work, while a short walk may fit when the user is on the move.

MOVA does not use continuous background GPS in the current version.

### 8. Private check-ins

After a reset, the user can say how they feel:

- Still drained
- About the same
- Better
- Much better

They can also choose what they need, such as less stress, better focus, water, or another short break.

These check-ins help MOVA understand which resets feel useful.

### 9. Progress and insights

MOVA can show:

- Completed resets
- Movement minutes
- Walking distance
- Active days
- Streaks
- Activity breakdowns
- Completion rates
- Rewards
- Learning progress

The app is careful with new users. It does not claim to understand a user after only one or two resets.

A new user may see:

> We're still learning your rhythm.

After more activity across several days, MOVA can show stronger observations.

### 10. Learning from behavior

MOVA keeps two ideas separate:

**What the user says:** their stated preferences and work information.

**What the user does:** completed resets, skipped resets, grace periods, reschedules, timing, duration, context, and check-ins.

Over time, actual behavior becomes useful evidence. For example, a user may say they like walking, but repeatedly complete short stretches instead. MOVA can gradually give more weight to what the user consistently completes.

### 11. Why this recommendation?

MOVA can show simple reasons for a recommendation, such as:

- Short resets have worked better recently.
- Afternoon resets have stronger completion history.
- MOVA is avoiding an activity that has often been postponed.
- The user's stated preference was included.

The goal is to make personalization understandable instead of mysterious.

### 12. User control

If MOVA shows an insight that feels wrong, the user can choose:

> That's not right

or:

> Forget

This hides the derived insight without deleting the user's real reset history. MOVA can learn again later if new behavior supports a similar pattern.

### 13. Demo Mode

Demo Mode uses a separate example user called Jordan.

It contains controlled example history so the team can demonstrate:

- Completed resets
- A skipped reset
- A rescheduled reset
- Walking history
- Check-ins
- Rewards
- Behavioral learning
- Context changes
- Persistent intervention

Demo Mode is stored separately from the real Firebase user. Resetting the demo does not delete the real user's data.

## What Is Real and What Is a Prototype?

### Real or functional

- The main React application
- Anonymous Firebase authentication when configured
- Firestore user persistence
- User profiles and settings
- Reset history
- Check-ins
- Reset lifecycle
- Grace-period data
- Browser geolocation when supported
- GPS walking distance tracking when supported
- Analytics and rewards calculated from reset data
- Deterministic behavioral learning
- Demo Mode isolation

### Prototype or limited

- Camera movement verification is simulated after the camera preview/scan interaction.
- Browser notifications are best effort and cannot work like a phone alarm after the browser is closed.
- Some places and walking screens still contain older demo helper code.
- There is no external LLM or trained machine-learning model in the current version.
- Automated tests have not yet been added.

These limitations do not remove the main product idea. They show which parts should be strengthened next for a production release.

## How To Present The Demo

1. Open the demo website: https://movahealthgh.vercel.app
2. Enter Demo Mode.
3. Show Jordan's profile and existing reset history.
4. Choose a context such as Work.
5. Trigger the next reset.
6. Show the persistent intervention.
7. Start the activity.
8. From the verification step, complete the camera scan or walking prototype flow.
9. Open Insights or Learning.
10. Explain how the result becomes evidence for future recommendations.
11. Reset Demo Mode and explain that the real user's data is separate.

## The Simple Competition Story

MOVA is not just telling people to move.

It helps choose a realistic moment, guides the reset, checks the result, records how the user felt, and uses that experience to improve the next suggestion.

That creates a cycle of:

```text
Work → Reset → Complete → Reflect → Learn → Improve
```

## Questions Judges May Ask

### 1. What problem does MOVA solve?

MOVA helps people take short movement and recovery breaks during demanding workdays, especially when normal reminders are easy to ignore.

### 2. Who is MOVA for?

It is for workers, students, and anyone who spends long periods working, studying, sitting, standing, or staying focused without a proper break.

### 3. Why is MOVA different from a reminder app?

A reminder app usually sends a notification and stops. MOVA guides the reset, records whether it was completed, and learns from the result.

### 4. What happens when a reset is due?

MOVA shows an in-app intervention with the activity, instructions, and a start action. The intervention remains active until the reset is completed or the user uses the separate grace option.

### 5. Can users dismiss the intervention?

The active MOVA intervention does not provide normal dismiss, skip, snooze, or later buttons. Operating-system actions such as closing the browser are outside the app's control.

### 6. What if the user is busy or in danger of being interrupted?

They can use the grace option and explain that they cannot take the break right now. Grace is not counted as completion.

### 7. Does MOVA use real data?

The normal version uses real user actions, reset history, check-ins, and Firebase persistence. Demo Mode uses controlled example data so the presentation can be completed quickly.

### 8. Does MOVA use AI?

The current intelligence is deterministic behavior-based software. It uses real signals and rules instead of allowing a generative AI model to invent conclusions.

### 9. Is there an LLM in the project?

No external LLM provider is currently used. The explanations are generated from structured behavioral signals.

### 10. How does MOVA learn?

It observes completed resets, skipped resets, grace periods, reschedules, activity types, durations, time windows, location context, and check-ins.

### 11. Does MOVA learn after one reset?

No. New users start with cautious messaging. Stronger insights require repeated behavior across multiple days.

### 12. What is the difference between a preference and behavior?

A preference is what the user says they like. Behavior is what they actually complete or postpone. MOVA keeps both and gradually gives more importance to repeated behavior.

### 13. Can MOVA change its mind?

Yes. Recent behavior receives more weight than older behavior, so current habits can influence future recommendations.

### 14. How does MOVA choose activities?

It uses the user's work profile, activity history, duration results, recent behavior, friction signals, context, and a small amount of exploration.

### 15. Will MOVA recommend the same activity forever?

It tries to avoid immediate repetition and gives suitable new activities a small exploration opportunity.

### 16. What does friction mean in MOVA?

Friction means a repeated combination of time, context, duration, or activity that causes the user to skip, reschedule, or use grace.

### 17. Does MOVA know why someone skipped?

Only when the user provides a reason, such as being in a meeting or with a patient. Otherwise, MOVA records the behavior without pretending to know the reason.

### 18. Does MOVA use location?

It can use browser location to identify saved Home, Work, or School contexts. Location is used when needed and there is no continuous background GPS in the current version.

### 19. Does MOVA store a location history?

The current design stores saved places and may store a reset-start context. It does not store a continuous raw GPS trail.

### 20. How does walking verification work?

MOVA starts a fresh walking session, tracks GPS points, filters obvious GPS noise, calculates distance, and can complete the reset after the target distance is reached.

### 21. Does the walking session start from zero?

The main walking tracker starts each new tracking session with zero distance. The team is aware that an older route-level tracker should eventually be consolidated with it.

### 22. How is the camera scan accessed?

The user does not need to search for a separate scanning feature. After starting a camera-based reset, MOVA opens the verification step, and the camera scan is accessed from there.

### 23. Does camera verification use computer vision?

Not yet. The camera preview and permission flow are real, but the current posture result is a controlled prototype scan.

### 24. Is camera footage stored?

No. The current implementation does not upload or store camera frames or video.

### 25. What happens if camera permission is denied?

MOVA shows a fallback state and does not claim that real camera detection occurred. The demo can still explain the verification architecture honestly.

### 26. What database does MOVA use?

MOVA uses Cloud Firestore for user-scoped profile, settings, reset, check-in, and saved-place data.

### 27. What authentication does MOVA use?

It uses Firebase Anonymous Authentication. The user does not need to create an email or password account for the current experience.

### 28. How do you protect user data?

Firestore rules require the authenticated user's UID to match the user document path. This prevents one user from reading another user's data.

### 29. What happens if Firebase is unavailable?

The app can use its local cache fallback, but cloud persistence is unavailable until Firebase is configured or available again.

### 30. What is Demo Mode?

Demo Mode is an isolated presentation environment with a sample user, seeded history, accelerated actions, and controlled results. It does not overwrite real Firebase data.

### 31. What is the strongest part of MOVA?

The strongest part is the closed loop: MOVA does not stop at reminding. It connects the reminder to action, verification, reflection, and a better next recommendation.

## Final Message

MOVA helps people make space between work and exhaustion. It starts with simple information, gives a realistic reset, stays with the user through completion, and becomes more useful as it learns from real behavior.

The best short description is:

> MOVA is a wellness companion that does not just remind people to move. It helps them follow through and uses what happened to make the next break fit better.
