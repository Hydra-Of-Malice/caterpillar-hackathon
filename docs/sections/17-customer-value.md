# 17 — Customer Value: Where the Money Is, and What the AI Actually Does

*Every number in §3 is an **illustrative model built from stated assumptions**, not a measured
result and not an industry statistic. The assumptions are listed so a customer can replace them with
their own figures in ten minutes. The point of this document is the **mechanism** and the
**measurement plan** — a value claim nobody can check after deployment is marketing, not a business
case.*

---

## 1. The honest frame

Most operator-monitoring pitches claim a productivity percentage. We are not going to, because:

- we have no field data to support one, and a figure we cannot source will not survive the first
  question from somebody who runs a quarry;
- the claim is usually unfalsifiable — nobody measures the counterfactual.

What we will claim is narrower and stronger:

> **CAT Sentinel converts lost time and near-misses from anecdotes into attributed, timestamped
> records — and it instruments its own benefit, so the value is measurable within one quarter
> instead of asserted forever.**

Everything below follows from that.

---

## 2. The five value mechanisms, each tied to built code

### 2.1 Correct attribution of lost time — the largest and most overlooked

`sentinel/taskcentre/waiting.py` · `brain.handle_camera_observation`

A camera sees a stationary machine. The naive product calls that "idle operator" and pressures the
operator. Ours does not:

- if the operator has **declared a wait** ("Waiting for truck"), the observation is suppressed
  before any human sees it, and the time is recorded as **waiting**, not idle;
- if the detector reports a context that explains it, likewise;
- only genuinely unexplained pauses past a threshold reach a supervisor, once per pause.

**Why this is where the money is.** A stationary excavator is usually not an operator problem — it
is a *haul-fleet cycle* problem. A system that blames the operator hides the real bottleneck and the
site keeps buying the wrong fix. Ours produces the number that matters: *how many machine-hours were
lost waiting for trucks, per shift, per bench.* That is a capital allocation input, not a discipline
tool.

**The operator-relations argument matters commercially too.** A monitoring system the crew believes
is unfair gets worked around, and a worked-around system produces garbage data. Declared waiting is
the feature that buys operator consent.

### 2.2 Catching a fault before the shift, not during it

`sentinel/taskcentre/checklist.py`

A task cannot start until all 14 pre-start items are answered. A **critical FAIL blocks the start**
and opens a supervisor ticket automatically.

**Mechanism:** a fault found at 06:00 in the yard is a scheduled repair. The same fault found at
11:00 at the face is unplanned downtime plus a recovery trip. The system does not detect the fault —
the operator does — but it makes *not* recording it harder than recording it, and it routes the
record to someone who can act.

### 2.3 Shorter response to a critical event

`brain.handle_machine_sensor`

A critical machine event ranks every operator by distance *and* position freshness, alarms the
genuinely nearest eligible one, and tells their supervisor and the admins. If nobody qualifies it
says **"no eligible operator"** rather than naming someone.

**Mechanism:** the cost of an incident is dominated by how long the dangerous state persists. This
removes the "who is closest?" radio round-trip.

### 2.4 Struck-by prevention with the operator in the loop

`brain.raise_proximity_prompt` · `/tc/op/flags`

A person-near-machine event alarms the operator, notifies the supervisor, and then **asks the
operator to confirm or dispute it** — a dispute requires a comment.

**Mechanism:** struck-by is among the most severe incident classes on a worksite, and its costs are
overwhelmingly indirect (stoppage, investigation, insurance, hiring). Asking the operator is not
politeness: they are the only person who knows whether the detector saw a spotter doing their job or
somebody in the swing path. Without that, the flags become noise and get ignored.

### 2.5 Scheduling against honest ranges

`sentinel/eta` · the dynamic task timer

LightGBM quantile regression with conformal calibration produces a task-time **interval with stated
coverage**, not a point estimate. The operator sees elapsed time and expected finish live.

**Mechanism:** a schedule built on point estimates absorbs every overrun as a surprise. A schedule
built on calibrated ranges prices the uncertainty once, up front.

---

## 3. An illustrative model — replace these numbers with the customer's

**Assumptions** (single 20-tonne excavator, one shift/day, 250 working days):

| Input | Value used | Where a customer gets theirs |
|---|---|---|
| Machine owning + operating cost | 4,500 /hr | Their own fleet cost model |
| Operator cost | 900 /hr | Payroll |
| Unplanned downtime, all-in | 18,000 /hr | Maintenance records |
| Productive hours per shift | 6.5 | Telematics |

*Currency deliberately unnamed — the arithmetic is identical in any.*

**The model.** Each line states what has to be true for it to hold. **None of these are measured
results.**

| Mechanism | Assumption that must hold | Annual effect |
|---|---|---|
| Waiting time correctly attributed, leading to **one** haul-cycle fix | Site recovers 15 min/shift of avoidable waiting after seeing the data | 250 × 0.25 h × 4,500 ≈ **281,000** |
| Pre-start gate converts **two** mid-shift failures/year into scheduled repairs | 3 h unplanned downtime avoided each time | 2 × 3 × 18,000 = **108,000** |
| Overrun visibility recovers 10 min/shift of schedule slip | Supervisor acts on the live timer | 250 × 0.167 h × 5,400 ≈ **225,000** |
| **Subtotal, productivity only** | | **≈ 614,000 per machine per year** |

**Safety is modelled separately and deliberately not added in.** A single avoidable struck-by
incident dwarfs the table above, but incident *frequency* is exactly the number we cannot honestly
estimate from a prototype. The right framing for a customer: *this is insurance whose premium is the
deployment cost, and whose payout you can compute from your own incident history.*

**Cost side.** A supervisor spends perhaps 10 minutes a shift on the review queue — about 40,000/yr
of supervisor time per crew. Any honest case nets this off, and it is the number that rises if the
system produces too many flags, which is why suppression is a first-class feature rather than a
refinement.

---

## 4. What makes this credible: the system measures its own benefit

This is the part to lead with in front of an industry audience. **Every mechanism above already has
a counter in the data model**, so a pilot can be evaluated rather than believed:

| Claim | Already recorded | Where |
|---|---|---|
| Waiting is being attributed | Declared waiting minutes, per operator, per reason | `tc_wait_period` |
| Flags are worth reading | Confirm vs dismiss ratio per flag kind | `tc_review_decision` |
| The gate catches things | `checklist_fail` tickets, critical vs non-critical | `tc_ticket`, `tc_task_checklist` |
| Dispatch is faster | Incident → notification → acknowledgement timestamps | `tc_incident`, `tc_notification` |
| Estimates are calibrated | Planned vs actual finish, per task | `tc_task` |
| Operators trust it | Proximity flags confirmed vs disputed | `tc_review_decision` |

**A 30-day pilot with the detectors in shadow mode produces all six numbers and costs one
supervisor 10 minutes a shift.** That is the ask — not a purchase decision on a projection.

The dismiss ratio is the honest one to watch. If supervisors dismiss most flags, the system is
wasting their attention and the productivity case collapses. We built the counter that would expose
that, because a vendor who hides it should not be trusted.

---

## 5. What the AI is actually doing — and where we deliberately did not use it

The split is the engineering argument, and it is also a commercial one: an auditable system is
deployable in a safety context, and an unauditable one is not.

**Machine learning, where patterns cannot be written down:**

| Model | Job | Why ML |
|---|---|---|
| Isolation Forest | Anomalous operating behaviour | No labelled incident set exists. Unsupervised is the only honest option. |
| LightGBM quantile regression + conformal | Task-time ranges | Needs a calibrated *interval*; the relationship between conditions and duration is not writable as rules. |
| LightGBM classifier | Work-phase segmentation | Phase boundaries are fuzzy and operator-specific. |
| Gaussian mixtures | Operator technique clustering | Groups emerge from data rather than being defined. |
| DTW alignment | Trainee vs expert motion | Compares *shape* of motion under different timing. |
| GPT-4o + hybrid RAG | Answering operator questions from manuals | Language. Every sentence is citation-verified; uncited claims are refused. |

**Rules, where a person must be able to argue with the output:**

- **Critical safety** (`sentinel/safety`) — a separate process that imports no ML at all, enforced by
  a test that fails the build. Safety that depends on a model is safety that fails in a way nobody
  can explain.
- **Geofence classification** — haversine with an accuracy gate. A poor fix reads `unverified`, never
  `outside`, because a false "outside" accuses a person of leaving site.
- **Foresight** (`sentinel/taskcentre/foresight.py`) — 7 deterministic rules over recorded facts. We
  call it "what could happen", not prediction, because it is not one.
- **Idle suppression** — thresholds and declared-wait overlap, not a model.

**The commercial reading:** ML is used where it earns its keep and nowhere near the safety path. A
buyer's risk team can audit every decision that could hurt somebody.

---

## 6. What we do not claim

- **No productivity percentage.** We have no field data, and the honest answer to "how much faster?"
  is "run the 30-day pilot in §4."
- **No fatigue diagnosis.** We surface a *work-schedule risk estimate* from hours and rest, labelled
  as such. Inferring a person's physiological state from machine telemetry is not supported by
  evidence we could find, and claiming it would be a liability.
- **No incident-rate reduction figure.** The mechanism is defensible; the frequency is not estimable
  from a prototype.
- **No autonomy.** Nothing in this system controls a machine. Every AI output names a person who
  decides. That is a deliberate product boundary, not a missing feature.

The case for buying this is not that the AI is clever. It is that **the system turns arguments about
lost time into records with causes attached, refuses to guess where it cannot know, and counts its
own results so the customer can stop taking our word for it.**
