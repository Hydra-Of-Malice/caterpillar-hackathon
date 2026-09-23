/**
 * `/tc/sup/review` — the AI, location and task overrun review queue (GET /tc/sup/review).
 *
 * Each flag shows its kind, severity, subject operator and the evidence behind it: the camera clip
 * placeholder, the observation timeline, distances and planned-versus-actual timings, plus every
 * earlier decision. The supervisor confirms it, dismisses it as a false flag, or asks for more
 * information, with a comment and an optional constructive message to the operator.
 *
 * Nothing here is deleted: a dismissed flag stays in the history marked dismissed, and confirming a
 * productivity flag does not penalise the operator by itself.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { sup } from '../../api';
import { GmtTime, NotAvailable, SimulatedChip, TcError, TicketCard, kindLabel } from '../../components';
import { POLL } from '../../constants';
import { fmtMetres, nowTs } from '../../time';
import type { DecisionBody, SupOperatorRow, Ticket, TicketDecision } from '../../types';
import { Button, Checkbox, PageTitle, Segmented } from '../../../components/ui';
import { useNow, useResource } from '../../../lib/hooks';
import { Card, Caveat, Chip, EmptyState, Icon, cx, gate, operatorName } from './common';

type StatusFilter = 'open' | 'all';

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export default function ReviewQueue() {
  const now = useNow(5_000) / 1000;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [kindFilter, setKindFilter] = useState('all');
  /** Decisions recorded in this session, kept on screen so the retained record is visible. */
  const [justDecided, setJustDecided] = useState<Record<string, DecisionBody & { ts: number }>>({});

  const queue = useResource(() => sup.review(), [], POLL.supervisor);
  const team = useResource(() => sup.operators(), []);

  const tickets = queue.data ?? [];
  const nameOf = (id?: string | null) => {
    const row = team.data?.find((o: SupOperatorRow) => o.user_id === id);
    return row ? operatorName(row) : (id ?? 'Unknown operator');
  };

  const kinds = useMemo(() => Array.from(new Set(tickets.map((t) => t.kind))).sort(), [tickets]);
  const shown = tickets.filter((t) => {
    if (kindFilter !== 'all' && t.kind !== kindFilter) return false;
    if (statusFilter === 'open' && t.status !== 'open' && !justDecided[t.ticket_id]) return false;
    return true;
  });

  return (
    <div className="space-y-8">
      <div>
        <Link to="/tc/sup" className="inline-flex items-center gap-1 text-body-sm font-semibold text-notice-dark hover:underline">
          <Icon name="arrow_back" size={18} /> My team
        </Link>
      </div>

      <PageTitle
        title="Review queue"
        sub="Flags raised by the simulated detectors, by the geofence rules or by a task overrun. A flag is a prompt to look, never a verdict. Times are GMT."
        right={
          <Segmented
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'open', label: 'Open' },
              { value: 'all', label: 'All returned' },
            ]}
          />
        }
      />

      <Card
        title={`${shown.length} flag${shown.length === 1 ? '' : 's'}`}
        sub="Confirm, dismiss as a false flag, or ask the operator for more information."
        right={
          kinds.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              <FilterChip label="All kinds" on={kindFilter === 'all'} onClick={() => setKindFilter('all')} />
              {kinds.map((k) => (
                <FilterChip key={k} label={kindLabel(k)} on={kindFilter === k} onClick={() => setKindFilter(k)} />
              ))}
            </div>
          ) : undefined
        }
      >
        {gate(queue, 'The review queue', 'Loading review queue') ??
          (shown.length === 0 ? (
            <EmptyState icon="rule" title={tickets.length === 0 ? 'Nothing waiting for review' : 'Nothing matches this filter'}>
              {tickets.length === 0
                ? 'Idle flags, fatigue prompts, punches outside the geofence and task overruns appear here. Decided flags stay in the history, marked with what was decided.'
                : 'Clear the filter to see the rest of the queue.'}
            </EmptyState>
          ) : (
            <ul className="space-y-6">
              {shown.map((t) => (
                <li key={t.ticket_id}>
                  <TicketCard
                    ticket={t}
                    now={now}
                    footer={
                      <TicketFooter
                        ticket={t}
                        now={now}
                        subjectName={t.subject_name ?? nameOf(t.subject_user_id)}
                        decidedNow={justDecided[t.ticket_id]}
                        onDecided={(body) => {
                          setJustDecided((d) => ({ ...d, [t.ticket_id]: { ...body, ts: nowTs() } }));
                          queue.reload();
                        }}
                      />
                    }
                  />
                </li>
              ))}
            </ul>
          ))}
      </Card>

      <Caveat icon="balance">
        Detector output is an indication, never proof, and it never controls a machine. Confirming a productivity flag records that it was real; it does not
        penalise the operator by itself.
      </Caveat>
    </div>
  );
}

function FilterChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cx(
        'rounded border px-2.5 py-1 font-display text-label-sm uppercase transition-colors',
        on ? 'border-cat bg-cat/10 text-cat-text' : 'border-outline-variant text-on-surface-muted hover:text-on-surface',
      )}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------- evidence extras + decision
function TicketFooter({
  ticket,
  now,
  subjectName,
  decidedNow,
  onDecided,
}: {
  ticket: Ticket;
  now: number;
  subjectName: string;
  decidedNow?: DecisionBody & { ts: number };
  onDecided: (body: DecisionBody) => void;
}) {
  return (
    <div className="space-y-5 border-t border-outline pt-4">
      <div className="flex flex-wrap items-center gap-2 text-body-sm text-on-surface-muted">
        <span>Subject:</span>
        {ticket.subject_user_id ? (
          <Link to={`/tc/sup/operator/${ticket.subject_user_id}`} className="font-semibold text-notice-dark hover:underline">
            {subjectName}
          </Link>
        ) : (
          <span>no operator named</span>
        )}
        <span>· raised</span>
        <GmtTime ts={ticket.created_at} gmt={ticket.created_at_gmt} mode="datetime" />
        {ticket.task_id && <span>· task {ticket.task_id}</span>}
      </div>

      <EvidenceExtras ticket={ticket} now={now} />

      {decidedNow ? (
        <div className="border border-success bg-success/10 px-3 py-2 text-body-sm text-success-text">
          Recorded: <strong>{decidedNow.decision.replace(/_/g, ' ')}</strong> at <GmtTime ts={decidedNow.ts} mode="datetime" />.
          {decidedNow.comment ? ` “${decidedNow.comment}”` : ''} The flag keeps its place in the history with this decision attached — nothing is deleted.
        </div>
      ) : (
        <DecisionPanel ticket={ticket} subjectName={subjectName} onDecided={onDecided} />
      )}
    </div>
  );
}

/**
 * The parts of the evidence that deserve more than a key/value row: the clip placeholder, the
 * observation timeline, the distances and the planned-versus-actual timings. `<TicketCard>` already
 * renders the full evidence map and the decision history above this.
 */
function EvidenceExtras({ ticket, now }: { ticket: Ticket; now: number }) {
  const ev = ticket.evidence ?? {};
  const timeline = Array.isArray(ev.timeline) ? ev.timeline : Array.isArray(ev.observations) ? ev.observations : null;
  const cameraId = str(ev.camera_id);
  const cameraLabel = str(ev.camera_label) ?? cameraId;
  const clip = str(ev.clip) ?? str(ev.clip_url);
  const context = str(ev.context);
  const idleSeconds = num(ev.idle_seconds);
  const cameraSourced = Boolean(cameraId || clip) || ticket.kind === 'ai_idle';

  const distances: Array<[string, number]> = [];
  const addDistance = (label: string, v: unknown) => {
    const n = num(v);
    if (n !== null) distances.push([label, n]);
  };
  addDistance('Distance from the geofence centre', ev.distance_m);
  addDistance('Geofence radius', ev.radius_m);
  addDistance('Reported fix accuracy', ev.accuracy_m);
  addDistance('Distance to the machine', ev.nearest_distance_m);
  addDistance('Dispatch distance limit', ev.max_distance_m);

  const timings: Array<[string, number]> = [];
  const addTime = (label: string, v: unknown) => {
    const n = num(v);
    if (n !== null) timings.push([label, n]);
  };
  addTime('Planned start', ev.start_ts);
  addTime('Actually started', ev.started_at);
  addTime('Expected finish', ev.expected_finish_ts ?? ev.planned_finish_ts);
  addTime('Actually finished', ev.finished_at ?? ev.actual_finish_ts);
  const overrun = num(ev.overrun_s);

  const nothingExtra = !cameraSourced && !timeline && !context && idleSeconds === null && distances.length === 0 && timings.length === 0 && overrun === null;
  if (nothingExtra) return null;

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {cameraSourced && (
        <section className="md:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-display text-label-sm uppercase text-on-surface-muted">Camera evidence</h4>
            <SimulatedChip source={ticket.source} />
          </div>
          <NotAvailable
            className="mt-2 max-w-[460px]"
            icon="videocam_off"
            title={clip ? 'Clip placeholder' : 'No clip in this prototype'}
            detail={`${cameraLabel ? `Camera ${cameraLabel}.` : 'Camera not identified.'} Observations come from a simulated detector; no video is recorded, stored or streamed.`}
          />
          {(context || idleSeconds !== null) && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-body-md">
              {idleSeconds !== null && (
                <span className="text-on-surface tnum">
                  Idle for {Math.round(idleSeconds / 60)} min ({idleSeconds} s observed)
                </span>
              )}
              {context && <Chip tone="blue">Context: {context.replace(/_/g, ' ')}</Chip>}
            </div>
          )}
        </section>
      )}

      {timeline && timeline.length > 0 && (
        <section className="md:col-span-2">
          <h4 className="font-display text-label-sm uppercase text-on-surface-muted">Observation timeline (GMT)</h4>
          <ol className="mt-2 space-y-1.5 border-l-2 border-outline pl-4">
            {timeline.map((item, i) => (
              <TimelineItem key={i} item={item} />
            ))}
          </ol>
        </section>
      )}

      {distances.length > 0 && (
        <section>
          <h4 className="font-display text-label-sm uppercase text-on-surface-muted">Distances</h4>
          <ul className="mt-2 space-y-0.5">
            {distances.map(([label, v]) => (
              <li key={label} className="text-body-md text-on-surface-variant">
                {label}: <span className="text-on-surface tnum">{fmtMetres(v)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-body-sm text-on-surface-muted">A fix worse than the accuracy limit is unverified, never outside.</p>
        </section>
      )}

      {(timings.length > 0 || overrun !== null) && (
        <section>
          <h4 className="font-display text-label-sm uppercase text-on-surface-muted">Planned vs actual (GMT)</h4>
          <ul className="mt-2 space-y-0.5">
            {timings.map(([label, v]) => (
              <li key={label} className="text-body-md text-on-surface-variant">
                {label}: <GmtTime ts={v} mode="datetime" />
              </li>
            ))}
            {overrun !== null && <li className="text-body-md text-warning-text tnum">Overran by {Math.round(overrun / 60)} min</li>}
            <li className="text-body-sm text-on-surface-muted">
              Now: <GmtTime ts={now} mode="datetime" />
            </li>
          </ul>
        </section>
      )}
    </div>
  );
}

function TimelineItem({ item }: { item: unknown }) {
  if (typeof item === 'string') return <li className="text-body-md text-on-surface-variant">{item}</li>;
  const o = (item ?? {}) as Record<string, unknown>;
  const ts = num(o.ts);
  const text = str(o.text) ?? str(o.label) ?? str(o.state) ?? str(o.kind) ?? JSON.stringify(o);
  return (
    <li className="text-body-md text-on-surface-variant">
      {ts !== null && <GmtTime ts={ts} mode="smart" className="mr-2 text-on-surface" />}
      {text}
    </li>
  );
}

// ---------------------------------------------------------------- decision
const DECISIONS: Array<{ value: TicketDecision; label: string; icon: string; note: string; needsComment: boolean }> = [
  {
    value: 'confirmed',
    label: 'Confirm',
    icon: 'check_circle',
    note: 'Records that the flag was real. It does not penalise the operator by itself — if it needs a conversation, send a message with it.',
    needsComment: false,
  },
  {
    value: 'dismissed',
    label: 'Dismiss as false flag',
    icon: 'cancel',
    note: 'The flag stays in the history, marked dismissed, with your comment. Nothing is deleted and the detector output is never overwritten.',
    needsComment: true,
  },
  {
    value: 'more_info',
    label: 'Request more info',
    icon: 'help',
    note: 'Leaves the flag open and asks the operator for context before you decide.',
    needsComment: true,
  },
];

function DecisionPanel({ ticket, subjectName, onDecided }: { ticket: Ticket; subjectName: string; onDecided: (body: DecisionBody) => void }) {
  const [decision, setDecision] = useState<TicketDecision | null>(null);
  const [comment, setComment] = useState('');
  const [sendMessage, setSendMessage] = useState(false);
  const [message, setMessage] = useState('');
  const [invalid, setInvalid] = useState('');
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);

  const chosen = DECISIONS.find((d) => d.value === decision);

  const submit = async () => {
    if (!decision || !chosen) return;
    setInvalid('');
    setError(undefined);
    if (chosen.needsComment && !comment.trim()) {
      setInvalid('Add a short comment so the record explains itself later.');
      return;
    }
    if (sendMessage && !message.trim()) {
      setInvalid('Write the message, or turn off the message to the operator.');
      return;
    }
    const body: DecisionBody = {
      decision,
      comment: comment.trim(),
      ...(sendMessage && message.trim() ? { message_to_operator: message.trim() } : {}),
    };
    setBusy(true);
    try {
      await sup.decide(ticket.ticket_id, body);
      onDecided(body);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {DECISIONS.map((d) => (
          <Button key={d.value} icon={d.icon} variant={decision === d.value ? 'primary' : 'secondary'} onClick={() => setDecision((cur) => (cur === d.value ? null : d.value))}>
            {d.label}
          </Button>
        ))}
      </div>

      {chosen && (
        <div className="mt-4 space-y-4">
          <p className="text-body-sm text-on-surface-muted">{chosen.note}</p>

          <label className="block">
            <span className="font-display text-label-sm uppercase text-on-surface-muted">Comment{chosen.needsComment ? '' : ' (optional)'}</span>
            <textarea
              className="input mt-1.5 h-20 py-2 leading-6"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={busy}
              placeholder={chosen.value === 'dismissed' ? 'Why this was not a real problem.' : 'What you checked, and what happens next.'}
            />
            <span className="mt-1 block text-body-sm text-on-surface-muted">Recorded with your name and the GMT time.</span>
          </label>

          <Checkbox checked={sendMessage} onChange={setSendMessage} label={`Send a constructive message to ${subjectName}`} />
          {sendMessage && (
            <label className="block">
              <span className="font-display text-label-sm uppercase text-on-surface-muted">Message to the operator</span>
              <textarea
                className="input mt-1.5 h-20 py-2 leading-6"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={busy}
                placeholder="Thanks for flagging the truck wait — log it as a delay next time and I will chase the haulage."
              />
              <span className="mt-1 block text-body-sm text-on-surface-muted">This arrives in their chat with you. Keep it specific and useful.</span>
            </label>
          )}

          {invalid && <p className="text-body-sm text-danger-text">{invalid}</p>}
          {error !== undefined && <TcError error={error} what="Your decision" />}

          <Button variant="primary" icon="gavel" onClick={submit} disabled={busy}>
            {busy ? 'Recording…' : `Record: ${chosen.label}`}
          </Button>
        </div>
      )}
    </div>
  );
}
