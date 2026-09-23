# CAT Sentinel — Google Stitch Master Prompt (v2)

How to use:
1. Paste **Part A (Design System)** into Stitch first.
2. Then paste **one screen prompt from Part C at a time**, in the order given. Each one starts with "Using the CAT Sentinel design system…" so the style carries over.
3. After every screen, check it against the **Part D acceptance checklist** before moving on.
4. **Part B** lists what to remove or fix from the v1 Stitch export (`stitch_cat_smart_operator_assistant.zip`).

All people, machines, sites and numbers below are **fictional sample data**. Telemetry in the demo is **SIMULATED**.

---

## PART A — DESIGN SYSTEM PROMPT (paste first)

```
Create the design system for "CAT Sentinel — Safety-First Operator Copilot", a web app for heavy-equipment (excavator) operators, instructors and site supervisors. It follows Caterpillar's digital design language (digital.cat.com).

TWO THEMES
1) IN-CAB THEME (dark, for the 10-inch rugged tablet in the machine cab, 1280x800 landscape):
   - Background #0E0E0E, panels #1E1E1E, raised panels #262626, borders #3A3A3A (1px) or #565656 (2px for emphasis).
   - Text #FFFFFF primary, #E1E1E1 secondary, #AAAAAA tertiary. Never use grey text darker than #AAAAAA on dark panels. Text contrast is at least 7:1.
2) OFFICE THEME (light, for supervisor, instructor and training screens on a 1440x900 desktop), mirroring digital.cat.com:
   - Black top header bar #000000 with white text; page background #FFFFFF; section background #F2F2F2; borders #CCCCCC; dividers #E1E1E1.
   - Body text #3F3F3F, headings #000000, secondary text #666565, links #0067B8 (hover #0078D6).

BRAND
- Cat Yellow #FFCD11 is the only brand accent. It is used for primary buttons, the active navigation item, a 4px active-tab underline and a thin 4px brand stripe at the very top of the screen.
- Primary button: fill #FFCD11, black #000000 text, 1px #B18D00 border, hover #FFE672, 4px corner radius. Never put white text on yellow.
- Secondary button: transparent or white background, 1px black border (office) or 2px #757575 border (in-cab), with black or white text respectively.
- Danger button: #C52320 fill with white text, hover #DE2222.
- Do not use the official Caterpillar logo. Use a plain wordmark: "CAT SENTINEL" set in Roboto Condensed Bold, with a small yellow square before it.

TYPOGRAPHY (Google Fonts)
- Headings, labels, big numbers: "Roboto Condensed", Bold 700. Short labels and signal words in UPPERCASE with 0.04em letter-spacing. Headings in normal case.
- Body: "Noto Sans" 400/600.
- All changing numbers use tabular figures.
- Scale (px, line-height): Display 48/56, Headline 32/40, Title 24/32, Title-sm 20/28, Body 16/24, Body-sm 14/20, Label 14/20 semibold, Footnote 12/16.
- In-cab minimums: body 18px, alert headline 32px, live numbers 40px or larger.

SHAPE, SPACING, ELEVATION
- 8px spacing grid (4px for fine adjustments). Content max width 1200px on desktop.
- Corner radius: 4px for buttons, inputs and chips; 8px for cards. No pill shapes except small status dots.
- In-cab: no soft shadows. Show depth with tonal steps and 1–2px borders.
- Office: subtle shadow 0 1px 4px rgba(0,0,0,.2) on cards.
- Motion: 150ms ease for state changes; no decorative animation.

SAFETY ALERT SYSTEM (ANSI Z535 signal words; never communicate by colour alone)
Every alert has a signal word, an icon shape, a colour and a text label.
- DANGER (tier T-CRIT): red #C52320 fill, white text, octagon icon, full-width banner, audible tone icon, cannot be dismissed while the condition is true. May pulse at most 1 Hz.
- WARNING (tiers T2 elevated and T3 stop/break recommended): orange #E56C00 fill, black text, triangle icon, requires ACKNOWLEDGE.
- CAUTION (tier T1 advisory): yellow #F3C206 fill, black text, rounded-square icon. Auto-clears. Rate-limited to at most 1 per 10 minutes per type.
- NOTICE (tier T0 coaching): blue #0067B8 (#4DB1FF on dark), white text on blue, "i" circle icon. NEVER shown in-cab while the machine is moving; queued for after the shift.
- SUPERVISOR NOTIFIED (tier T4): purple #8F24D1 chip with a person-with-arrow icon. Always visible to the operator when an escalation is sent.
- System health: PROTECTION ACTIVE (green #197527 chip) or PROTECTION DEGRADED (red outline chip plus a striped hazard band).

PROVENANCE BADGES (show on every alert, metric and chart when "Demo Mode" is on)
Small 4px-radius outline chips, uppercase, 12px Roboto Condensed:
- RULE: white or black outline; deterministic check.
- ML: #1AC69E outline; trained model output.
- SIMULATED: #6852BE outline with diagonal stripes; simulated telemetry or results.
- MOCK: #909090 dashed outline; placeholder integration.

A "DEMO MODE: SIMULATED TELEMETRY" ribbon (purple #6852BE, striped) sits in the top-right corner of every screen.

DATA VISUALISATION
- Series colours, in order: #0066FF blue, #1AC69E green, #FB5A00 orange, #6852BE purple.
- Baselines and envelopes are shown as a light band (#FFFFFF at 10% on dark, #000000 at 6% on light) with the operator's value as a solid line.
- Uncertainty is shown as a range bar: P10–P90 as a thin track, P50 as a bold tick, the actual value as a dot.
- Always label axes and units. No 3-D charts and no gauges with fake needles.

TOUCH AND ERGONOMICS (in-cab)
- Primary controls at least 64x64px, all targets at least 48x48px, at least 16px between targets.
- Keep critical buttons away from the outer 24px of the screen edge.
- At most ONE active alert banner at a time, with a small "+2 queued" counter.
- No scrolling on the in-cab Live screen.

ICONS
- Material Symbols Outlined, 24px (32px in-cab), stroke weight 400.

COMPONENT STATES
Design default, hover (office only), pressed, disabled, loading, empty, error and offline states for buttons, cards, tables, the alert banner and the connection chip.

TONE OF COPY
- Short, plain, imperative: "Slow your swing near the truck."
- Never say "fatigued", "unsafe operator", or give a percentage confidence to the operator. Say "possible", "unusual for this task" and "above your usual range".
```

---

## PART B — FIXES FOR THE v1 STITCH EXPORT (what the v1 screens got wrong)

| Found in v1 | Why it must change | Replace with |
|---|---|---|
| "EMERGENCY LOCKOUT" button, "SOUND DUAL CAB HORN", "Hard Ignition Lockout", "auto-engine shutdown", "Hydraulic ENGAGED" controls | The app never sends machine-control commands. ML is decision support only. | "LOG INCIDENT", "TAKE BREAK", "CALL SUPERVISOR (radio)". Show OEM interlock states only as read-only status. |
| "ISO 13849 SIL-2 conformant", "0ms delay", "Production arch, no placeholder stubs", "100/100 rubric", "ALL P0 COMPLETE" | Unsupported claims that judges will challenge (SIL is an IEC 61508 concept). | Honest status chips: RULE / ML / SIMULATED / MOCK, and a measured "Rule latency p99: __ ms" shown as a live value. |
| "98.42% confidence (Softmax)", "85% confidence" shown to the operator | False precision, and not calibrated. | Operator sees "Unusual for Truck Loading (top 2% of your shifts)". Calibrated numbers go only on the Diagnostics screen. |
| AI Vision Engine, CAM 01/02 video feeds with object boxes, LiDAR 360 radar, RTK HUD overlay | We are not building computer vision. Proximity is optional hardware. | A simple top-down proximity-zone diagram fed by a proximity signal, with a "Proximity sensing: NOT FITTED" state. |
| Personnel names from RFID ("M. Reynolds") | Surveillance and privacy risk. | "Person detected — rear zone" with no identity. |
| CAN bus 250 kbps, WS stream, REST API inspector, JSON blocks on operator screens | Developer information distracts the operator. | Move everything to the Diagnostics screen (screen 19). The in-cab UI shows only a single "Edge: ONLINE" chip. |
| Dense 3-column in-cab dashboard with more than 30 values | Too much cognitive load while operating. | The Live screen shows at most 6 status items plus one alert slot. |
| "Mandated Operating Protocol" text blocks in the alert | Too long to read while operating. | Alert = what + why + one action (≤ 12 words each). Details go in Post-Shift Review. |
| Barlow Condensed font | Not Caterpillar's typeface. | Roboto Condensed (Cat's official secondary font) plus Noto Sans. |
| "D. Covington, Chief Operator" | Our demo persona is a novice. | "Ravi Kumar, Operator, 3 months" (fictional). |
| Missing screens | Requirements R1–R5 need them. | Add screens 1–21 below. |

Keep from v1: the dark carbon panels, yellow primary buttons, uppercase condensed labels, left navigation rail, top status bar, bottom status strip, task progress bar and the "machine vs habit" two-track idea on the anomaly screen (renamed; see screen 16).

---

## PART C — SCREEN PROMPTS (one per generation, in this order)

Sample data used everywhere (fictional):
- **Operator:** Ravi Kumar, ID OP-1042, 3 months' experience, 212 operating hours.
- **Machine:** Cat 320 hydraulic excavator, unit EX-07.
- **Site:** North Quarry, Bench 3.
- **Shift:** 06:00–14:30.
- **Supervisor:** Priya Nair. **Instructor:** Marcus Lee.
- **Weather:** 31 °C, dust moderate, light rain forecast from 13:00.
- **Tasks:**
  1. **Truck Loading, Bench 3:** 420 m³ clay-gravel into haul trucks. Estimate P50 3 h 10 m (P10 2 h 40 m to P90 3 h 55 m).
  2. **Trench Excavation T-4:** 60 m long, 1.5 m deep. Estimate P50 2 h 05 m (1 h 40 m to 2 h 50 m). Ravi's first trench on this site.
  3. **Stockpile Tidy:** Estimate P50 40 m (30–55 m).

### IN-CAB SCREENS (dark theme, 1280x800 landscape)

**Common in-cab frame (apply to screens 1–8):**
- **Top status rail (72px tall, #000):** "CAT SENTINEL" wordmark · Unit EX-07 · Operator Ravi K. · shift clock "06:42" · continuous-operation timer "Operating 1 h 52 m · last break 06:00" · seatbelt chip (FASTENED green / UNFASTENED red) · proximity chip (ACTIVE / NOT FITTED / FAULT) · protection chip (PROTECTION ACTIVE / DEGRADED) · connection chip (EDGE ONLINE · CLOUD SYNC OK / OFFLINE — QUEUED 42).
- **Left navigation rail (96px wide, icon above label, 64px targets):** HOME · OPERATE · CHECKLIST · LOG · TRAINING · REVIEW.
- **Bottom action bar (80px, three large buttons):** LOG INCIDENT (secondary), TAKE BREAK (secondary), CALL SUPERVISOR (secondary, radio icon).
- **Demo ribbon** in the top-right corner.

**1. Shift Start / Sign-in**
```
Using the CAT Sentinel design system, in-cab dark theme, 1280x800. Screen "Shift Start".
Center card: "Good morning, Ravi" (Headline). Below it, a large "TAP BADGE TO START SHIFT" target (NFC icon, 200x200, yellow outline) with a MOCK badge, plus an alternative "Enter operator ID" numeric keypad (64px keys).
Right panel "Today at a glance": Unit EX-07 Cat 320 excavator · North Quarry, Bench 3 · Shift 06:00–14:30 · 3 tasks · Weather 31 °C, dust moderate, rain from 13:00 (weather icon).
Bottom panel "What CAT Sentinel records" (privacy notice, body-sm): machine signals and alerts during your shift; you can see all of your own data; supervisors see alerts that were escalated to them and team totals; no camera or microphone recording. Link "Learn more". Checkbox "I understand" (48px).
Primary button "START PRE-SHIFT CHECK" (yellow, 64px tall), disabled until the checkbox is ticked.
```

**2. Operator Home / Daily Task Dashboard (R1, R5)**
```
Using the CAT Sentinel design system, in-cab dark theme, 1280x800, with the common in-cab frame. Screen "Home".
Header row: "Tuesday 23 Sep · Shift 06:00–14:30" and a shift progress bar (18% of shift elapsed).
Main left (2/3 width): "TODAY'S TASKS" list of three task cards.
Each card shows: priority number, task name (Title), location, quantity, status chip (IN PROGRESS / QUEUED / DONE) and a progress bar with a percentage.
The ESTIMATE block is a horizontal range bar with a P10–P90 thin track, a P50 bold tick and a "now" marker. Text reads "Est. finish 10:05 (likely 09:35–10:50)", with a small "Why this estimate?" link and an ML badge.
- Card 1 "Truck Loading, Bench 3": 420 m³, 34% done (143 m³). Est. finish 10:05, range 09:35–10:50. Chip "Rain from 13:00 not affecting this task".
- Card 2 "Trench Excavation T-4": 60 m × 1.5 m. Est. 2 h 05 m (1 h 40 m – 2 h 50 m). Yellow CAUTION chip "First trench on this site. Recommended: 4-min module 'Trenching near edges'" with a "START MODULE" button. Also a MOCK chip "Spotter assigned: yes".
- Card 3 "Stockpile Tidy": Est. 40 m (30–55 m).
Main right (1/3 width):
(a) "PRE-SHIFT CHECK" card: "14/14 passed · 05:52" with a green check and a RULE badge.
(b) "BREAKS" card: "Operating 1 h 52 m continuously. Break suggested at 2 h 00 m" with a thin progress bar toward the 120-minute mark and a RULE badge.
(c) "RECENT ALERTS" card: the last 3 alerts with signal-word chips, e.g. "06:31 CAUTION · Swing speed near truck", "06:12 DANGER · Seatbelt unfastened while moving (cleared in 4 s)". Link "View log".
(d) "AFTER THIS SHIFT" card: "3 coaching tips saved for your post-shift review" with a NOTICE chip.
Primary button "GO TO OPERATE" (yellow, 64px).
```

**3. Pre-Shift Checklist (R2)**
```
Using the CAT Sentinel design system, in-cab dark theme, 1280x800, with the common frame. Screen "Pre-Shift Check".
Left: a vertical stepper with 4 groups, each showing a completion count:
- WALK-AROUND (6)
- CAB & CONTROLS (4)
- SAFETY SYSTEMS (3)
- SITE CONDITIONS (1)
Center: checklist items as 72px-tall rows. Each row has the item name, a short hint, and a 3-way segmented control PASS / FAIL / N/A (64px segments).
Items:
- Walk-around: tracks & rollers; hoses & fittings (no leaks); bucket, teeth & pins; mirrors & cameras clean; lights; fire extinguisher present.
- Cab & controls: seatbelt latches and retracts; horn works; travel alarm works; hydraulic lockout lever works.
- Safety systems: seatbelt sensor reads FASTENED (shows a live value chip); proximity sensing self-test (ACTIVE / NOT FITTED); CAT Sentinel protection self-test (PASSED, with a RULE badge).
- Site conditions: ground conditions & overhead hazards reviewed, with a "Toolbox talk done" toggle.
One row in the FAIL state expands to show:
- a text field "Describe the defect"
- a camera button "ADD PHOTO" (MOCK)
- a red outline note "Defects are sent to maintenance and your supervisor"
Bottom: progress "11/14", and a primary button "SIGN OFF CHECK" (disabled until all are answered).
Also show the variant state "All 14 passed", with a green banner "Check complete · 05:52 · signed Ravi K."
```

**4. OPERATE — Live View, normal state (R2, R4)** (the most important screen)
```
Using the CAT Sentinel design system, in-cab dark theme, 1280x800, with the common frame. Screen "Operate". No scrolling. Minimal and glanceable.
Top center: the ALERT SLOT (full content width, 120px tall). In this normal state it shows a quiet dark bar reading "All clear" with a green dot.
Left half: "CURRENT TASK · Truck Loading, Bench 3" (Title). A big number "143 / 420 m³" (Display, tabular numerals) with a progress bar, "Cycles 58 · avg 24 s", and an estimate range bar "Finish 10:05 (09:35–10:50)" with an ML badge.
Right half: "PROXIMITY" top-down diagram. A simple excavator outline seen from above in the center, with two concentric zones: a WARNING zone at 8 m (orange dashed ring) and a DANGER zone at 4 m (red ring), split into 4 sectors (front, right, rear, left). All sectors are dark/clear. Label "Proximity: ACTIVE" with a RULE badge. Place a truck icon at the front-left, outside the zones, labelled "Truck HT-12 · 9.5 m".
Under the diagram, a status list of 4 rows with icons:
- Seatbelt FASTENED
- Idle today 12 m (7 m waiting for truck)
- Travel speed 0.0 km/h
- Operating 1 h 52 m
Beside the status list, a large toggle button "WAITING FOR TRUCK" (64px, secondary style; when ON it turns blue with the text "WAITING — idle not flagged"). This is how idle time gets its context.
Bottom action bar: LOG INCIDENT · TAKE BREAK · CALL SUPERVISOR.
Small footer text: "Coaching tips are saved for after your shift."
```

**5. OPERATE — Alert states (generate as 6 variants of screen 4)**
```
Using the CAT Sentinel design system, generate 6 variants of the in-cab "Operate" screen. Only the ALERT SLOT and relevant indicators change. Each alert follows a 3-line pattern: WHAT (headline, 32px) / WHY (body 18px) / DO (one action), plus a source badge. Only one banner at a time; show a "+1 queued" counter where relevant.

5a DANGER — seatbelt: red #C52320 full-width banner with an octagon icon and "DANGER" signal word.
  WHAT "SEATBELT UNFASTENED — MACHINE MOVING". WHY "Seat switch open with parking brake released". DO "Fasten your seatbelt now".
  Badge RULE. No dismiss button; shows "Clears when fastened". Seatbelt chip in the top rail turns red. Speaker icon indicates an audible tone.

5b DANGER — proximity: red banner. WHAT "PERSON IN REAR DANGER ZONE — 3.2 m". WHY "Proximity sensor, rear sector". DO "Stop swing. Confirm the area is clear".
  The diagram's rear sector fills red with a person icon (no name). Badge RULE.

5c WARNING (T2) — approach and swing speed: orange #E56C00 banner with a triangle icon.
  WHAT "FAST SWING NEAR TRUCK". WHY "Swing 38% above your truck-loading range, within 5 m of truck · 3rd time today". DO "Slow the swing when the bucket is near the truck".
  Buttons: "ACKNOWLEDGE" (yellow, 64px) and a smaller "NOT CORRECT?" (secondary) for operator feedback.
  Badges RULE + ML. A small "WHY?" expander reveals 3 horizontal bars: swing rate vs your usual band; bucket-to-truck distance; approach speed. Each bar shows the operator value against a shaded normal band.

5d CAUTION (T1) — excessive idle, context-aware: yellow #F3C206 banner.
  WHAT "ENGINE IDLING 9 MIN". WHY "No truck waiting in dispatch". DO "Consider shutting down if the wait continues".
  Auto-clears. Badge RULE + context.
  Also show an example of a SUPPRESSED idle: a small grey line under the status list, "Idle 6 m — waiting for truck (not flagged)".

5e WARNING (T3) — break recommended: orange banner with a coffee/pause icon.
  WHAT "BREAK RECOMMENDED". WHY "2 h 30 m continuous operation (site limit 2 h)". DO "Park safely and take a 10-minute break".
  Buttons "START BREAK" (yellow) and "REMIND ME IN 10 MIN" (secondary, allowed once). Badge RULE.
  After snoozing, a purple "SUPERVISOR WILL BE NOTIFIED AT 2 h 45 m" chip appears.

5f SYSTEM — protection degraded: a red hazard-striped band across the top rail, "PROTECTION DEGRADED — proximity sensor not responding · Rely on mirrors and your spotter". The proximity diagram is greyed out with a "NO SIGNAL" label and a timestamp of the last good reading. Connection chip shows "EDGE ONLINE".
  Also show a separate OFFLINE mini-variant of the top rail: "CLOUD OFFLINE — 42 events queued · Safety checks still running on this machine".
```

**6. Quick Incident / Near-Miss Log (modal over Operate)**
```
Using the CAT Sentinel design system, in-cab dark theme. A modal sheet (900x640) titled "LOG INCIDENT / NEAR-MISS".
Step 1: type, as 6 large 120x96 tiles with icons: Near-miss · Person too close · Ground/slope issue · Machine fault · Damage · Other.
Step 2: severity segmented control: Low / Medium / High.
Step 3: auto-attached context, shown read-only with a RULE badge: time 07:14 · Bench 3, truck-loading zone · machine state "swinging, 0 km/h" · "Last 30 s of machine signals saved".
Optional: "ADD VOICE NOTE" (mic icon, MOCK) and "ADD NOTE" (on-screen keyboard).
Buttons "SAVE" (yellow) and "CANCEL".
Success toast: "Saved to incident log · will sync when online".
```

**7. Break Screen**
```
Using the CAT Sentinel design system, in-cab dark theme. Screen "Break".
A large countdown "09:12" (Display 80px) with the label "BREAK — 10 MIN".
Suggestions list with icons: drink water, stretch, walk around the machine, check the site plan.
Optional card "How alert do you feel?" with a 1–9 scale (Karolinska Sleepiness Scale labels: 1 extremely alert … 9 very sleepy, fighting sleep). Mark it clearly "Optional · research · only you and the study team see this". Include a "Skip" button.
Buttons "END BREAK" (yellow) and "CALL SUPERVISOR".
Footer: "Break logged 08:32. Continuous-operation timer reset."
```

**8. Post-Shift Review (operator, T0 coaching)**
```
Using the CAT Sentinel design system, in-cab dark theme (also works on a phone). Screen "Your Shift Review — Tue 23 Sep".
Top summary tiles: Operating 7 h 40 m · Tasks 2 of 3 done · Material moved 420 m³ · Idle 38 m (24 m waiting for truck, 9 m warm-up, 5 m unexplained) · Alerts 1 DANGER, 3 WARNING, 2 CAUTION.
Section "WHAT WENT WELL" (green check list): "Smooth bucket control — steadier than your last 5 shifts"; "Pre-shift check on time".
Section "ONE THING TO WORK ON" (NOTICE blue card), with a small "Based on 7 events across 2 shifts (7 of 81 loading cycles)" line and ML + RULE badges:
  "Swing speed near the truck."
  "Fast swings within 5 m of the truck happened 5 times today and 2 times in your previous shift, mostly late in the loading cycle."
  Mini chart: swing rate per cycle, with your normal band shaded and the 5 flagged cycles marked.
  Button "START 4-MIN MODULE: Approach & Swing Control" (yellow).
Section "SHIFT TIMELINE": a horizontal 06:00–14:30 timeline with task blocks (blue/green/orange) and alert markers as signal-word icons. Tapping a marker opens a detail card with what / why / the explanation bars, plus the operator actions "This was correct" and "This was wrong — add note".
Footer: "These notes are for your coaching. They are not used for pay or discipline."
```

### TRAINING HUB (R3): office light theme at 1440x900, plus a responsive tablet version

**9. Training Hub — Home**
```
Using the CAT Sentinel design system, OFFICE LIGHT THEME, 1440x900. Black top header with the "CAT SENTINEL" wordmark and nav: Home · Training · Incidents · Tasks · Crew · Diagnostics. The active nav item has a yellow 4px underline. User menu "Ravi Kumar".
Page title "Training Hub".
Left column (2/3):
(a) "RECOMMENDED FOR YOU": 2 large module cards, each with a thumbnail placeholder, title, duration, and a "Why recommended" line with a small evidence chip.
  - "Approach & Swing Control" · 4 min · "7 fast swings near truck in 2 shifts" · status IN TRAINING.
  - "Trenching Near Edges" · 5 min · "Before your first trench task today" · status NOT STARTED.
  Each card has a yellow "START" button, and an "Instructor approved · v1.2 · 12 Aug 2026" chip.
(b) "ALL MODULES": filterable grid (filters: Machine type, Competency, Format [Video · Micro-lesson · Scenario quiz · Simulator]). 8 small cards.
Right column (1/3):
(c) "MY COMPETENCIES": a list of 14 competencies with state chips:
  - UNASSESSED (grey)
  - GAP OBSERVED (orange)
  - IN TRAINING (blue)
  - IMPROVING (teal)
  - DEMONSTRATED — verified by instructor (green, with a check and the instructor's initials)
  Items: Pre-start inspection (DEMONSTRATED ✓ ML), Seatbelt & cab entry (DEMONSTRATED), Approach & swing control (IN TRAINING), Trenching near edges (UNASSESSED), Blind-zone awareness (IMPROVING), Slope travel (UNASSESSED), Truck loading technique, Load handling, Fuel-efficient idle practice (GAP OBSERVED), Working near spotters, Emergency procedures, and others.
  Legend at the bottom: "Only an instructor or a passed assessment can mark DEMONSTRATED."
(d) "UPCOMING": "Simulator session with Marcus Lee · Thu 25 Sep 10:00" (MOCK badge) and a "BOOK INSTRUCTOR" button.
```

**10. Micro-Module Player + "Ask the Manual" (RAG)**
```
Using the CAT Sentinel design system, office light theme, 1440x900. Screen "Approach & Swing Control — Module 1 of 3".
Left (2/3): a 16:9 video area placeholder labelled "Expert demonstration — swing approach to truck (placeholder video)", with a progress bar of 3 steps.
Below it, "KEY POINTS", 3 numbered points. Each ends with a citation chip like "[Site SOP-EX-04 §3.2, v1.2]":
  1. Slow the swing as the bucket approaches the truck body.
  2. Keep the bucket higher than the truck side boards before you swing over them.
  3. Never swing the bucket over the truck cab.
A "WHY THIS MATTERS FOR YOU" callout (blue NOTICE): "Your fast swings happened within 5 m of the truck, late in the cycle."
Right (1/3): an "ASK THE MANUAL" chat panel.
  Header: "Answers only from approved documents".
  Example Q: "How close can the bucket be to the truck cab?"
  Example answer with 2 citation chips linking to document name, section and version, plus a "View source passage" expander showing the quoted passage in a grey box.
  Second example, the "no source" state: Q "Can I load while the driver is in the truck?" → answer "I couldn't find this in the approved documents. Ask your supervisor or instructor." with an "ASK INSTRUCTOR" button.
  Footer: "Safety-critical answers show the source text. Content v1.2 reviewed by M. Lee."
Bottom: "NEXT: SCENARIO QUIZ" (yellow).
```

**11. Scenario Quiz / Assessment**
```
Using the CAT Sentinel design system, office light theme. Screen "Scenario Quiz — Approach & Swing Control".
Question card with a top-down illustration placeholder (excavator, truck, bucket path). Question: "The bucket is 4 m from the truck body and swinging fast. What should you do?"
4 large answer options (radio cards).
After answering: a green or red feedback panel with an explanation and a citation chip.
Progress "Question 2 of 5". End state: "Score 4/5 — passed. Next: practise on the next shift. Your swing near the truck will be checked automatically over the next 3 shifts." Buttons "BOOK SIMULATOR PRACTICE" (MOCK) and "DONE".
```

**12. Instructor & Simulator Booking**
```
Using the CAT Sentinel design system, office light theme. Screen "Book an instructor".
Filters: Topic (pre-selected "Approach & Swing Control"), Format (On machine · Simulator · Video call), Date.
Instructor cards: Marcus Lee (Excavator, Simulator), and one other fictional instructor. Each shows available time slots as chips.
Selected slot: "Thu 25 Sep 10:00–11:00 · Simulator bay 2".
Confirmation panel: summary and a "CONFIRM BOOKING" yellow button with a MOCK badge.
Success state: "Booked. Added to your shift calendar."
```

**13. Training Effect — Before/After**
```
Using the CAT Sentinel design system, office light theme. Screen "Did the training help? — Approach & Swing Control".
A SIMULATED ribbon, plus a banner: "Demo data (SIMULATED). Real results need a controlled trial."
Chart: share of truck-loading cycles with a fast swing near the truck, per shift (Shift 0, Shift 1, then Shift 2). A vertical line marks "Training completed 23 Sep". Bars with 95% interval whiskers.
Side card with 4 figures:
- Before: 7 of 81 cycles (8.6%)
- After: 2 of 45 cycles (4.4%)
- Rate ratio: 0.51, 95% interval 0.05–2.70, shown as a range bar crossing a "no change = 1.0" line
- Verdict chip: "Trending better, not yet conclusive"
Caveat box: "Too few cycles to be sure. The interval includes no change. Early events may also drop by chance (regression to the mean). Next: assessment with an instructor, and more shifts of data."
Status chip "IMPROVING — assessment scheduled with Marcus Lee". Note: "Not yet DEMONSTRATED; an instructor must verify."
```

### SUPERVISOR / INSTRUCTOR SCREENS (office light theme, 1440x900)

**14. Supervisor — Crew Overview**
```
Using the CAT Sentinel design system, office light theme, 1440x900, black header nav. Screen "Crew — North Quarry, Day Shift".
Top KPI row (5 tiles):
- Machines active 6/7
- Protection degraded 1 (red)
- Open escalations 2 (purple)
- Idle today 3 h 10 m (58% waiting for truck)
- Tasks on track 9/11
Main table "MACHINES & OPERATORS". Columns: Unit · Operator · Current task · Progress & finish estimate (mini range bar) · Protection status chip · Open alerts (counts by signal word) · Continuous operation · Last sync.
6 rows of fictional data. One row has PROTECTION DEGRADED; one shows "Operating 2 h 50 m" with an orange chip.
Right panel "ESCALATIONS": cards for each T4 escalation, with what, when, operator, and buttons "Call operator (radio)" and "Mark resolved" plus a notes field. Example: "EX-07 · Break recommendation snoozed · 2 h 45 m continuous".
Footer note: "No operator ranking. Individual coaching data is visible to the operator and their instructor."
```

**15. Incident Log (R2)**
```
Using the CAT Sentinel design system, office light theme. Screen "Incident Log".
Filter bar: date range, unit, operator, signal word (DANGER/WARNING/CAUTION/NOTICE), source (RULE / ML / MANUAL), type (seatbelt, proximity, speed near truck, idle, near-miss, machine fault), status (Open / Reviewed / Closed). Buttons "EXPORT CSV" and "NEW ENTRY".
Table columns: Time · Unit · Operator · Signal word chip · Type · Source badge · Context (task, zone) · Operator note (icon if disputed) · Status.
12 fictional rows.
Selecting a row opens a right DETAIL DRAWER (480px):
- title and signal word
- timeline chart of the 60 s around the event (swing rate, travel speed, proximity distance), with the threshold line and the event marker
- "WHY FLAGGED" explanation bars
- auto-attached context
- operator's note, e.g. "Truck driver reversed early"
- linked competency, e.g. "Approach & swing control"
- review actions: "Mark reviewed", "Close", "Link to training"
Show one manual near-miss entry with a voice-note attachment (MOCK).
```

**16. Unusual Behaviour & Idle Analysis (R4)**
```
Using the CAT Sentinel design system, office light theme. Screen "Unusual Behaviour & Idle".
Tabs: IDLE · UNUSUAL OPERATION · MACHINE HEALTH.
IDLE tab:
- stacked bar per machine per day, split into: waiting for truck (blue), warm-up/cool-down (green), unexplained (orange)
- table of the longest unexplained idle periods, with a context column
- "Estimated fuel in unexplained idle: ~14 L today" with a RULE badge
UNUSUAL OPERATION tab:
- scatter/timeline of flagged windows, coloured by category: unusual but harmless (grey), procedural (yellow), possible skill gap (orange), dangerous condition (red)
- a two-column "WHAT CAUSED IT?" panel for the selected event:
  - left: MACHINE SIGNALS — hydraulic pressure normal, no fault codes (green check)
  - right: OPERATING PATTERN — swing rate high near truck (orange)
  - result chip: "Likely operating pattern, not a machine fault"
- explanation bars comparing the event with the same-task baseline (not with other operators)
- badges ML (Isolation Forest, per task) + RULE
MACHINE HEALTH tab: fault-code list and a sensor drift note.
Footer: "Unusual ≠ unsafe. Events are reviewed in context before any coaching."
```

**17. Task Planning & Time Estimation (R5)**
```
Using the CAT Sentinel design system, office light theme. Screen "Tasks & Estimates".
Left: a "NEW TASK" form with fields:
- Task type (Truck loading / Trenching / Stockpile / Grading)
- Quantity (m³ or m)
- Material (clay-gravel / rock / topsoil)
- Location/bench
- Machine
- Operator
- Planned start
Weather is auto-filled: 31 °C, rain from 13:00 (MOCK weather feed).
Right: an ESTIMATE panel.
- Large "2 h 05 m likely" with a P10–P90 range bar "1 h 40 m – 2 h 50 m".
- "Based on 37 similar past tasks".
- "What moves this estimate": a horizontal bar list with + and − minutes: rain from 13:00 +8 m, first trench on this site for operator +12 m, clay-gravel material +4 m, 320 machine size −6 m.
- Calibration chip: "Last 30 tasks: 80% finished inside the range (target 80%)", with ML badge and SIMULATED badge.
Bottom: a table of recent tasks (estimate range vs actual), with a dot plot showing whether each actual fell inside its range.
Also show a "Low data" state: "Few similar tasks — showing typical time for this task type with a wider range".
```

**18. Instructor — Competency & Content Review**
```
Using the CAT Sentinel design system, office light theme. Screen "Instructor Workspace — Marcus Lee".
Tab 1 "OPERATORS": list of assigned operators with a competency heatmap (rows = operators, columns = 14 competencies, cells = state colours, never scores). Selecting Ravi shows the evidence for "Approach & swing control": events, training done, before/after chart. Buttons "VERIFY AS DEMONSTRATED", "Needs more practice", "Book session".
Tab 2 "CONTENT REVIEW": a queue of training content versions. Columns: Module · Version · Change summary · Sources cited (count) · Citation check (PASS / FAIL chip) · Status (Draft / In review / Approved). Selecting an item shows a diff view of the text with citation chips and buttons "APPROVE v1.3" / "REQUEST CHANGES".
```

### SYSTEM / JUDGE SCREENS (office light theme)

**19. Diagnostics & Model Cards (engineers and judges only)**
```
Using the CAT Sentinel design system, office light theme with monospaced values in Roboto Mono. Screen "Diagnostics".
Row 1 tiles (live, SIMULATED):
- Rule latency p50 / p99 (ms)
- ML alert latency p50 / p99
- Alerts per operating hour vs budget (e.g. 0.8 / h, budget ≤ 1.0)
- Edge CPU %
- Queue depth
- Last cloud sync
Row 2 "DATA SOURCES": a table with columns Signal · Tier (A telematics / B machine bus / C add-on sensor) · Status (LIVE / SIMULATED / NOT FITTED) · Rate (Hz).
Row 3 "MODEL CARDS": 2 cards.
- "Unusual operation detector — Isolation Forest per task type": trained on SIMULATED data, features 18, version, threshold set by alert budget, evaluation (event precision/recall on injected events — SIMULATED), known limits.
- "Task time — LightGBM quantile + conformal": interval coverage, width.
Row 4 "DRIFT & FEEDBACK": feature drift sparkline; operator "Not correct?" feedback count by alert type.
Row 5 "API INSPECTOR": collapsible JSON of the last telemetry message and the last alert.
```

**20. Requirements Traceability (judges)**
```
Using the CAT Sentinel design system, office light theme. Screen "How CAT Sentinel meets the brief".
A table with columns: Caterpillar requirement · Operator problem · Feature · Data used · Method (chips: RULE / ML / SIMULATED / MOCK) · Where to see it (link to screen) · Success measure.
Rows:
- R1 Daily task dashboard
- R2 Safety: seatbelt, proximity, incident log, working conditions
- R3 Training hub
- R4 Unusual behaviour & idle
- R5 Task-time estimation
Honest status column "Built / Simulated / Mocked".
No compliance claims, no scores out of 100.
Footer: "Prototype on simulated data. It has not been validated on Caterpillar operations and does not prove accident prevention."
```

**21. Privacy & Settings**
```
Using the CAT Sentinel design system, office light theme (and an in-cab dark variant). Screen "Privacy & Data".
Sections:
- "What is recorded" (machine signals, alerts, checklists, incident reports)
- "What is NOT recorded" (no camera, no microphone unless you add a voice note, no location outside shifts)
- "Who can see what" (a table with columns You / Your instructor / Supervisor / Fleet manager and rows Your coaching details / Alerts escalated to supervisor / Team totals)
- "Retention" (90 days for detailed signals, 2 years for incident records, as example values)
- "Optional research" (toggle: share break-time alertness ratings with the study team, default OFF)
- "Download my data" button
- "Dispute an alert" link
```

### PRACTICE ANALYSER — the training showcase (trainee vs Expert Motion Model)

**23. Practice Session — Live**
```
Using the CAT Sentinel design system, in-cab dark theme, 1280x800. Screen "Practice Session — Truck Loading (Basic)".
Top bar: trainee "Ravi Kumar (Trainee)", exercise picker (Truck loading — basic / Trench — basic), session timer, cycle counter "Cycle 4 of 8", and a button "RUN DEMO TRAINEE" with an archetype selector (Novice / Intermediate / Improving / Expert) and a SIMULATED badge.
Center: a large current-phase chip row: DIG → SWING LOADED → DUMP → SWING EMPTY, with the active phase highlighted in yellow.
Main chart: a live strip chart of the last 10 s for 4 channels (Swing, Boom, Stick, Bucket joystick). Each channel is a line over a shaded "EXPERT BAND" (P10–P90), and any part of the line outside the band is drawn in orange.
Right panel "LIVE HINT": one short sentence, e.g. "Ease off the swing — the truck is 4 m away".
Mini gauges: "Swing speed near truck 31°/s (expert ≤ 20)", "Boom–swing overlap 18% (expert 45–60%)".
Badges: ML (Expert Motion Model v1, trained on SIMULATED data from expert operators).
Bottom buttons: "FINISH & ANALYSE" (yellow) and "DISCARD".
```

**24. Practice Report — You vs Expert**
```
Using the CAT Sentinel design system, dark theme, 1440x900. Screen "Practice Report — Truck Loading (Basic)".
Header: an overall score "54 / 100" in Display type with a band chip "DEVELOPING" (bands: Beginner < 40, Developing 40–65, Proficient 65–85, Expert-like ≥ 85). Also "8 cycles analysed", ML + SIMULATED badges, and the note "Safety comes first: a cycle with a safety flag can't score above 60".
Row 1 "PHASE TIMING": a horizontal stacked bar per cycle phase, You vs Expert median (dig, swing loaded, dump, swing empty, idle gaps), with seconds labels.
Row 2 "METRIC CARDS", 8 cards. Each has the value, a thin expert P10–P90 band with a P50 tick and your dot, and a status chip EXPERT-LIKE / NEAR / NEEDS WORK:
- Cycle time 31 s (expert 20–26)
- Swing speed near truck 34°/s (≤ 20)
- Control smoothness
- Stick reversals in dig 9 (2–4)
- Boom–swing overlap 14% (45–60%)
- Bucket fill 78% (90–100%)
- Swing overshoot at dump 11° (≤ 4°)
- Idle gaps 3.2 s (≤ 1 s)
Row 3 "HOW YOUR MOVEMENT COMPARES": 4 small overlay charts, one per phase, for the most different channel. The expert band is shaded, your average curve is drawn as a solid yellow line, and the x-axis runs 0–100% of the phase.
Right column "TOP 3 THINGS TO IMPROVE", ranked tip cards:
- "Slow the swing in the last 5 m before the truck", with the detail "yours 34°/s vs expert ≤ 20°/s", competency chip "Approach & swing control", and button "START MODULE".
- "Raise the boom while you start the swing"
- "Fewer stop-start corrections on the stick"
Bottom: a per-cycle score sparkline (cycles 1–8, rising), plus buttons "PRACTISE AGAIN" and "BOOK INSTRUCTOR".
```

**25. Practice Progress**
```
Using the CAT Sentinel design system, dark theme. Screen "Practice Progress — Ravi Kumar".
Line chart of session scores over time, with the band thresholds as horizontal guide lines. A table of sessions (date, exercise, score, band, top tip). A "Biggest improvement: Boom–swing overlap +22 pts" callout. SIMULATED badge.
```

### COMPONENT SHEET (generate last)

**22. Component library**
```
Using the CAT Sentinel design system, create a component sheet showing both themes side by side:
- buttons (primary / secondary / danger / ghost, with all states)
- signal-word alert banners (DANGER, WARNING, CAUTION, NOTICE, SUPERVISOR NOTIFIED, PROTECTION DEGRADED)
- provenance badges (RULE, ML, SIMULATED, MOCK)
- status chips (FASTENED/UNFASTENED, ACTIVE/NOT FITTED/FAULT, EDGE ONLINE/OFFLINE)
- competency state chips (5 states)
- estimate range bar (P10/P50/P90 + actual dot)
- explanation bar (value vs normal band)
- proximity-zone diagram (clear, warning, danger, no-signal)
- task card
- checklist row (PASS/FAIL/N/A)
- incident table row and detail drawer
- KPI tile
- top status rail
- left nav rail
- bottom action bar
- modal sheet
- toast
- empty state
- offline state
```

---

## PART D — ACCEPTANCE CHECKLIST (check every generated screen)

**Safety and honesty**
- [ ] No button implies machine control (lockout, horn, shutdown, ignition). The only actions are Log, Break, Call, Acknowledge, Feedback and Start module.
- [ ] Every alert has a signal word, icon shape, colour and text (what / why / do). DANGER alerts have no dismiss button.
- [ ] No percentage "confidence", "SIL", "ISO conformant", "100/100", "fatigued" or "unsafe operator" wording.
- [ ] RULE / ML / SIMULATED / MOCK badges are present wherever data appears, and the Demo ribbon is visible.
- [ ] "Proximity NOT FITTED" and "PROTECTION DEGRADED" states exist.
- [ ] No personal identification from sensors (no names from RFID tags, no camera feeds).

**In-cab usability**
- [ ] Primary targets are at least 64px and all targets at least 48px, with body text at least 18px and live numbers at least 40px.
- [ ] Only one alert banner is visible at a time, with a queue counter. Coaching (NOTICE) never appears on the Operate screen.
- [ ] The Operate screen fits 1280x800 with no scrolling and shows at most 6 status items.
- [ ] Developer details (CAN bus, API, JSON) appear only on the Diagnostics screen.

**Caterpillar theme**
- [ ] Cat Yellow #FFCD11 is used only for brand and primary actions, always with black text.
- [ ] Roboto Condensed Bold for headings and labels, Noto Sans for body, tabular numerals for values.
- [ ] Office screens have the black header, white/#F2F2F2 surfaces and #CCCCCC borders. The official Cat logo is not used.

**Requirements coverage**
- [ ] R1: screens 2 and 14.
- [ ] R2: screens 3, 4, 5, 6 and 15.
- [ ] R3: screens 9–13 and 18.
- [ ] R4: screens 5d, 8 and 16.
- [ ] R5: screens 2, 4 and 17, with a P10–P90 range everywhere an estimate appears.
- [ ] The demo journey can be clicked through: 1 → 3 → 2 → 4 → 5c → 6 → 5e → 8 → 10 → 11 → 13 → 15 → 17.
