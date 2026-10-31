// Exercise and meal library. Static content; the coach picks from it by id.
// fit: where the exercise belongs. rest = rest day, pre = before a hard ride, post = after a hard ride.
export const EXERCISES = [
  // Mobility
  { id: 'hipflexor', cat: 'Mobility', name: 'Half-kneeling hip flexor stretch', purpose: 'Opens hip flexors shortened by hours in the saddle', dose: '2 × 45 s per side', intensity: 'Gentle stretch, 3/10', when: 'After riding or in the evening', cue: 'Squeeze the glute of the back leg; do not arch the lower back.', fit: { rest: true, pre: false, post: true } },
  { id: '9090', cat: 'Mobility', name: '90/90 hip rotations', purpose: 'Hip internal and external rotation for pedalling and descending', dose: '2 × 8 slow switches', intensity: 'Easy, controlled', when: 'Warm-up or rest day', cue: 'Sit tall; use your hands for support rather than forcing range.', fit: { rest: true, pre: true, post: true } },
  { id: 'thoracic', cat: 'Mobility', name: 'Open-book thoracic rotations', purpose: 'Upper-back rotation lost to a fixed riding posture', dose: '2 × 8 per side', intensity: 'Easy', when: 'Any day, desk breaks', cue: 'Keep knees stacked; rotate from the ribs, not the lower back.', fit: { rest: true, pre: true, post: true } },
  { id: 'ankle', cat: 'Mobility', name: 'Knee-to-wall ankle dorsiflexion', purpose: 'Ankle range for squats, walking descents and pedal stroke', dose: '2 × 10 per side', intensity: 'Easy', when: 'Before strength work', cue: 'Heel stays down; knee tracks over the second toe.', fit: { rest: true, pre: true, post: true } },
  { id: 'couch', cat: 'Mobility', name: 'Couch stretch', purpose: 'Quad and hip-flexor length', dose: '2 × 60 s per side', intensity: 'Moderate stretch, 4/10', when: 'Evening, after riding', cue: 'Back off if you feel knee pain; tuck the pelvis.', fit: { rest: true, pre: false, post: true } },
  // Strength
  { id: 'splitsquat', cat: 'Strength', name: 'Split squat (or goblet squat)', purpose: 'Single-leg strength and knee control on descents', dose: '3 × 8 per leg', intensity: 'RPE 7; 2–3 reps in reserve', when: 'Easy or rest day, ≥ 48 h before intervals', cue: 'Front knee over mid-foot; lower under control for 2–3 s.', fit: { rest: true, pre: false, post: false } },
  { id: 'rdl', cat: 'Strength', name: 'Romanian deadlift / hip hinge', purpose: 'Hamstring and glute strength, back resilience on the bike', dose: '3 × 8', intensity: 'RPE 7', when: 'Strength day', cue: 'Neutral spine; push hips back and stop when the back starts to round.', fit: { rest: true, pre: false, post: false } },
  { id: 'bridge', cat: 'Strength', name: 'Glute bridge (single-leg when easy)', purpose: 'Glute activation and hip extension', dose: '3 × 12 (or 3 × 8 per leg)', intensity: 'RPE 6', when: 'Activation before rides, or on rest days', cue: 'Ribs down; drive through the heel, not the lower back.', fit: { rest: true, pre: true, post: true } },
  { id: 'calf', cat: 'Strength', name: 'Calf raises (slow lowering)', purpose: 'Achilles and calf capacity for hiking and pushing the bike', dose: '3 × 12', intensity: 'RPE 6–7', when: 'Strength day', cue: 'Full range; three seconds down.', fit: { rest: true, pre: false, post: false } },
  { id: 'row', cat: 'Strength', name: 'One-arm row', purpose: 'Upper-back strength for posture and bike handling', dose: '3 × 10 per side', intensity: 'RPE 7', when: 'Strength day', cue: 'Pull the elbow to the hip; do not twist the torso.', fit: { rest: true, pre: false, post: true } },
  { id: 'pushup', cat: 'Strength', name: 'Push-ups or overhead press', purpose: 'Pushing strength and shoulder stability for MTB handling', dose: '3 × 8–12', intensity: 'RPE 7', when: 'Strength day', cue: 'A straight line from head to heel; elevate the hands if form breaks.', fit: { rest: true, pre: false, post: true } },
  { id: 'plank', cat: 'Strength', name: 'Front plank', purpose: 'Trunk stiffness to transfer pedalling force', dose: '3 × 30–45 s', intensity: 'Moderate', when: 'Any day', cue: 'Squeeze glutes; stop when the hips sag.', fit: { rest: true, pre: true, post: true } },
  // Core
  { id: 'deadbug', cat: 'Core', name: 'Dead bug', purpose: 'Anti-extension core control', dose: '2 × 8 per side', intensity: 'Easy–moderate', when: 'Warm-up or rest day', cue: 'Lower back stays pressed into the floor; breathe out as you extend.', fit: { rest: true, pre: true, post: true } },
  { id: 'sideplank', cat: 'Core', name: 'Side plank', purpose: 'Lateral trunk and hip stability', dose: '2 × 20–30 s per side', intensity: 'Moderate', when: 'Any day', cue: 'Hips high and stacked; shorten the lever from the knees if needed.', fit: { rest: true, pre: true, post: true } },
  { id: 'birddog', cat: 'Core', name: 'Bird dog', purpose: 'Cross-body stability and back health', dose: '2 × 8 per side', intensity: 'Easy', when: 'Any day', cue: 'Move slowly; keep a glass of water level on your back.', fit: { rest: true, pre: true, post: true } },
  { id: 'pallof', cat: 'Core', name: 'Pallof press (band)', purpose: 'Anti-rotation strength for out-of-saddle efforts', dose: '2 × 10 per side', intensity: 'Moderate', when: 'Strength day', cue: 'Hips and shoulders stay square to the front.', fit: { rest: true, pre: true, post: false } },
  // Cycling-specific
  { id: 'singleleg', cat: 'Cycling', name: 'Single-leg pedalling drills', purpose: 'Smooth stroke, removes dead spots', dose: '4 × 30 s per leg, easy gear (trainer best)', intensity: 'Zone 1–2', when: 'Within an easy ride', cue: 'Unclip safely only on a trainer; outdoors, bias one leg instead.', fit: { rest: false, pre: true, post: false } },
  { id: 'spinups', cat: 'Cycling', name: 'High-cadence spin-ups', purpose: 'Neuromuscular speed, warm-up opener', dose: '4 × 30 s building to 110+ rpm, 90 s easy between', intensity: 'Light resistance', when: 'Warm-up or opener before an event', cue: 'Stay seated and quiet on the saddle; ease off if you bounce.', fit: { rest: false, pre: true, post: false } },
  { id: 'seatedclimb', cat: 'Cycling', name: 'Seated low-cadence climbing', purpose: 'Climbing-specific muscular endurance', dose: '4 × 5 min at 55–65 rpm, 5 min easy', intensity: 'Zone 3 (tempo)', when: 'Ready days only', cue: 'Stop if knees ache; no grinding below 50 rpm.', fit: { rest: false, pre: false, post: false } },
  { id: 'offbike', cat: 'Cycling', name: 'Off-bike glute & hamstring circuit', purpose: 'Bridge + hinge + step-up circuit for riders', dose: '2 rounds: 10 bridges, 8 hinges, 8 step-ups per leg', intensity: 'RPE 6', when: 'Rest or easy day', cue: 'Quality over speed; rest 60 s between rounds.', fit: { rest: true, pre: false, post: false } },
  // Recovery
  { id: 'easyspin', cat: 'Recovery', name: 'Easy spin', purpose: 'Blood flow without adding fatigue', dose: '20–40 min', intensity: 'Zone 1, conversational', when: 'Day after a hard or long ride', cue: 'If HR drifts into Zone 2 on flat ground, go easier or stop.', fit: { rest: true, pre: false, post: true } },
  { id: 'walk', cat: 'Recovery', name: 'Brisk walk', purpose: 'Low-stress movement and daylight exposure', dose: '20–30 min', intensity: 'Easy, nasal breathing', when: 'Rest days, morning preferred', cue: 'Morning daylight also helps anchor the sleep cycle.', fit: { rest: true, pre: false, post: true } },
  { id: 'foam', cat: 'Recovery', name: 'Foam rolling (optional)', purpose: 'Short-term feel-good; evidence for recovery is weak', dose: '5–10 min: quads, calves, glutes', intensity: 'Mild discomfort only', when: 'If it helps you', cue: 'Avoid rolling directly on joints or the lower back.', fit: { rest: true, pre: true, post: true } },
  { id: 'breathing', cat: 'Recovery', name: 'Slow nasal breathing', purpose: 'Down-regulation on high-stress days', dose: '5 min, ~6 breaths/min (4 s in, 6 s out)', intensity: 'Relaxed', when: 'Evening or after work', cue: 'Stop if light-headed; this should feel easy.', fit: { rest: true, pre: true, post: true } },
  { id: 'stretch', cat: 'Recovery', name: 'Light full-body stretch', purpose: 'Wind-down routine', dose: '10 min', intensity: 'Gentle', when: 'Evening', cue: 'No bouncing; breathe out into each stretch.', fit: { rest: true, pre: false, post: true } },
];

// Routines the coach prescribes (ids above)
export const ROUTINES = {
  mobility10: { name: '10-min hip & thoracic mobility', ids: ['hipflexor', '9090', 'thoracic', 'couch'] },
  activation: { name: 'Pre-ride activation (5 min)', ids: ['bridge', 'deadbug', '9090'] },
  strength: { name: 'Rider strength (35–40 min)', ids: ['splitsquat', 'rdl', 'bridge', 'calf', 'row', 'pushup', 'plank'] },
  core: { name: 'Core (10 min)', ids: ['deadbug', 'sideplank', 'birddog', 'pallof'] },
  restday: { name: 'Rest-day routine (~40 min)', ids: ['walk', '9090', 'thoracic', 'bridge', 'sideplank', 'birddog'] },
  recovery: { name: 'Recovery (20–30 min)', ids: ['easyspin', 'hipflexor', 'stretch', 'breathing'] },
};

// Approximate macros; portions are typical, not weighed.
export const MEALS = [
  { name: 'Greek yoghurt, oats, banana and honey', p: 30, c: 75, when: 'Recovery / breakfast' },
  { name: 'Rice, two eggs, tuna and vegetables', p: 40, c: 80, when: 'Recovery after a long ride' },
  { name: 'Pasta with chicken and tomato sauce', p: 40, c: 100, when: 'Evening before or after a hard day' },
  { name: 'Wholemeal bocadillo with jamón or tortilla, plus fruit', p: 25, c: 70, when: 'Pre-ride, 2–3 h before' },
  { name: 'Lentil and chickpea stew with bread', p: 30, c: 90, when: 'Rest or easy day' },
  { name: 'Salmon, potatoes and green salad', p: 35, c: 60, when: 'Rest day dinner' },
  { name: 'Milk or soy shake with a banana', p: 20, c: 45, when: 'Within an hour of finishing, if a meal is far off' },
  { name: 'Cottage cheese or skyr with berries', p: 25, c: 20, when: 'Evening snack, protein top-up' },
];
