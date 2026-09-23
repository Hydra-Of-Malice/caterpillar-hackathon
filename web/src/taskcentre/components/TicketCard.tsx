/**
 * A review ticket: what was flagged, how serious, where the evidence came from, and every decision
 * made on it. The original event is never overwritten, so the decision history is append-only and
 * shown in full.
 */
import { useState, type ReactNode } from 'react';
import { Button, Icon, cx } from '../../components/ui';
import { ticketSubject } from '../api';
import { fmtMetres } from '../time';
import type { DecisionBody, ReviewDecision, Ticket, TicketDecision } from '../types';
import { SeverityChip, SimulatedChip, TicketStatusChip, kindLabel } from './Badges';
import { GmtTime } from './GmtTime';

// ---------------------------------------------------------------- evidence
const HIDE_KEYS = new Set(['ticket_id', 'site_id']);

function evidenceValue(v: unknown): ReactNode {
  if (v === null || v === undefined || v === '') return <span className="text-on-surface-muted">—</span>;
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'number') return <span className="tnum">{Number.isInteger(v) ? v : v.toFixed(2)}</span>;
  if (typeof v === 'string') return v;
  return <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-body-sm">{JSON.stringify(v, null, 2)}</pre>;
}

function evidenceLabel(k: string): string {
  return k.replace(/_/g, ' ').replace(/\bm\b/, '(m)').replace(/^\w/, (c) => c.toUpperCase());
}

/** Evidence map as a readable definition list, with timestamps rendered in GMT. */
export function EvidenceList({ evidence, className }: { evidence?: Record<string, unknown> | null; className?: string }) {
  const entries = Object.entries(evidence ?? {}).filter(([k]) => !HIDE_KEYS.has(k));
  if (entries.length === 0) return <p className={cx('text-body-sm text-on-surface-muted', className)}>No structured evidence was attached to this ticket.</p>;
  return (
    <dl className={cx('grid grid-cols-[minmax(120px,auto)_1fr] gap-x-4 gap-y-2 text-body-sm', className)}>
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-display text-label-sm uppercase text-on-surface-muted">{evidenceLabel(k)}</dt>
          <dd className="min-w-0 break-words text-on-surface-variant">
            {/^(ts|.*_ts|.*_at)$/.test(k) && typeof v === 'number' ? (
              <GmtTime ts={v} mode="datetime" />
            ) : /distance_m$|_m$/.test(k) && typeof v === 'number' ? (
              fmtMetres(v)
            ) : (
              evidenceValue(v)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------- decision history
const DECISION_ICON: Record<string, string> = {
  confirmed: 'check_circle',
  dismissed: 'cancel',
  more_info: 'help',
  resolved: 'task_alt',
  acknowledged: 'notifications_active',
};

export function DecisionHistory({ decisions, className }: { decisions?: ReviewDecision[] | null; className?: string }) {
  // undefined ≠ empty: "the response did not carry the history" is not "nobody has decided".
  if (decisions === undefined || decisions === null) return <p className={cx('text-body-sm text-on-surface-muted', className)}>Decision history was not included in this response.</p>;
  const list = decisions;
  if (list.length === 0) return <p className={cx('text-body-sm text-on-surface-muted', className)}>No decision has been recorded yet.</p>;
  return (
    <ol className={cx('space-y-3', className)}>
      {[...list]
        .sort((a, b) => a.ts - b.ts)
        .map((d, i) => (
          <li key={d.id ?? `${d.ticket_id}-${d.ts}-${i}`} className="flex items-start gap-2 text-body-sm">
            <Icon name={DECISION_ICON[d.decision] ?? 'gavel'} size={18} className="mt-0.5 text-on-surface-muted" />
            <div className="min-w-0">
              <div className="text-on-surface">
                <span className="font-display uppercase">{d.decision.replace(/_/g, ' ')}</span>
                <span className="text-on-surface-muted">
                  {' '}
                  by {d.reviewer_name ?? d.reviewer_id} ({d.reviewer_role}) · <GmtTime ts={d.ts} gmt={d.ts_gmt} mode="datetime" />
                </span>
              </div>
              {d.comment && <p className="mt-0.5 text-on-surface-variant">“{d.comment}”</p>}
            </div>
          </li>
        ))}
    </ol>
  );
}

// ---------------------------------------------------------------- decision form
const DECISIONS: TicketDecision[] = ['confirmed', 'dismissed', 'more_info', 'resolved'];

/**
 * Reviewer form. `withOperatorMessage` adds the supervisor's "message to operator" field
 * (POST /sup/review/{id}); admins use it without.
 */
export function TicketDecisionForm({
  onSubmit,
  busy,
  withOperatorMessage = false,
  allowed = DECISIONS,
  className,
}: {
  onSubmit: (body: DecisionBody) => void | Promise<void>;
  busy?: boolean;
  withOperatorMessage?: boolean;
  allowed?: TicketDecision[];
  className?: string;
}) {
  const [decision, setDecision] = useState<TicketDecision>(allowed[0]);
  const [comment, setComment] = useState('');
  const [message, setMessage] = useState('');

  return (
    <form
      className={cx('space-y-3', className)}
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit({ decision, comment: comment.trim(), ...(withOperatorMessage && message.trim() ? { message_to_operator: message.trim() } : {}) });
      }}
    >
      <label className="block">
        <span className="text-body-sm text-on-surface-variant">Decision</span>
        <select className="select mt-1" value={decision} onChange={(e) => setDecision(e.target.value as TicketDecision)} disabled={busy}>
          {allowed.map((d) => (
            <option key={d} value={d}>
              {d.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-body-sm text-on-surface-variant">Comment (recorded with your name and the GMT time)</span>
        <textarea className="input mt-1 h-24 py-2" value={comment} onChange={(e) => setComment(e.target.value)} disabled={busy} placeholder="What did you check, and what did you conclude?" />
      </label>
      {withOperatorMessage && (
        <label className="block">
          <span className="text-body-sm text-on-surface-variant">Message to the operator (optional)</span>
          <textarea className="input mt-1 h-20 py-2" value={message} onChange={(e) => setMessage(e.target.value)} disabled={busy} placeholder="Sent to their chat thread." />
        </label>
      )}
      <Button type="submit" variant="primary" icon="gavel" disabled={busy}>
        {busy ? 'Saving…' : 'Record decision'}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------- card
export function TicketCard({
  ticket,
  decisions,
  now,
  compact = false,
  onOpen,
  selected = false,
  footer,
  className,
}: {
  ticket: Ticket;
  /** Decision history when it is not already on the ticket. */
  decisions?: ReviewDecision[];
  now?: number;
  compact?: boolean;
  onOpen?: (t: Ticket) => void;
  selected?: boolean;
  footer?: ReactNode;
  className?: string;
}) {
  const history = decisions ?? ticket.decisions;
  const body = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityChip severity={ticket.severity} />
        <TicketStatusChip status={ticket.status} />
        <SimulatedChip source={ticket.source} />
        <span className="font-display text-label-sm uppercase text-on-surface-muted">{kindLabel(ticket.kind)}</span>
        <span className="ml-auto text-body-sm text-on-surface-muted">
          <GmtTime ts={ticket.created_at} gmt={ticket.created_at_gmt} mode="smart" />
        </span>
      </div>
      <h3 className="mt-2 font-display text-headline-sm text-on-surface">{ticket.title}</h3>
      {ticket.detail && <p className={cx('mt-1 text-body-md text-on-surface-variant', compact && 'line-clamp-2')}>{ticket.detail}</p>}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-on-surface-muted">
        {ticketSubject(ticket).name || ticketSubject(ticket).id ? (
          <span>
            <Icon name="person" size={16} className="align-[-3px]" /> {ticketSubject(ticket).name ?? ticketSubject(ticket).id}
          </span>
        ) : null}
        {ticket.machine_id && (
          <span>
            <Icon name="agriculture" size={16} className="align-[-3px]" /> {ticket.machine_id}
          </span>
        )}
        {ticket.task_id && (
          <span>
            <Icon name="task" size={16} className="align-[-3px]" /> {ticket.task_id}
          </span>
        )}
        <span>
          <Icon name="assignment_ind" size={16} className="align-[-3px]" /> {ticket.owner_name ?? ticket.owner_user_id ?? ticket.owner_role}
        </span>
        {now !== undefined && ticket.status === 'open' && <span className="text-warning-text">Waiting for review</span>}
      </div>
      {!compact && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <section>
            <h4 className="font-display text-label-sm uppercase text-on-surface-muted">Evidence</h4>
            <EvidenceList className="mt-2" evidence={ticket.evidence} />
          </section>
          <section>
            <h4 className="font-display text-label-sm uppercase text-on-surface-muted">Decision history</h4>
            <DecisionHistory className="mt-2" decisions={history} />
          </section>
        </div>
      )}
      {footer && <div className="mt-4">{footer}</div>}
    </>
  );

  if (onOpen) {
    return (
      <button
        type="button"
        onClick={() => onOpen(ticket)}
        aria-pressed={selected}
        className={cx('panel w-full rounded-lg p-4 text-left transition-colors hover:bg-surface-container-high', selected && 'border-cat ring-1 ring-cat', className)}
      >
        {body}
      </button>
    );
  }
  return <article className={cx('panel rounded-lg p-4', className)}>{body}</article>;
}
