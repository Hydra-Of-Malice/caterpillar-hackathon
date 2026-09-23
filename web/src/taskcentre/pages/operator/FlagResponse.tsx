/**
 * Operator — flags waiting for your account of what happened (`GET /tc/op/flags`).
 *
 * When a detector says somebody came close to the machine you are operating, that detection is
 * already on the record. This screen does not ask you to approve it: it asks you to add your own
 * account beside it. "Yes, that happened" and "No, that is not right" are both recorded, both go
 * to your supervisor with the evidence, and neither deletes the original detection.
 *
 * Rendered inside the operator's Alerts view.
 */
import { useState } from 'react';
import { errorText, opApi } from '../../api';
import { GmtTime, SeverityChip, SimulatedChip, TcEmpty, TcError, TcLoading, kindLabel } from '../../components';
import { Button, Icon, cx } from '../../../components/ui';
import { useResource } from '../../../lib/hooks';
import { POLL } from '../../constants';
import { fmtMetres } from '../../time';
import type { FlagResponseKind, OpFlag } from '../../types';
import { Note, TOUCH_BIG } from './common';

const ANSWER_LABEL: Record<FlagResponseKind, string> = {
  acknowledged: 'Yes, that happened',
  disputed: 'No, that is not right',
};

/** Evidence the API attached, shown as plain "name: value" rows rather than hidden. */
function EvidenceRows({ evidence }: { evidence: Record<string, unknown> | undefined }) {
  const entries = Object.entries(evidence ?? {}).filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object');
  if (entries.length === 0) return null;
  return (
    <dl className="mt-3 space-y-1 border-t border-outline pt-3 text-body-md">
      {entries.map(([k, v]) => (
        <div key={k} className="flex flex-wrap items-baseline gap-2">
          <dt className="text-on-surface-muted">{k.replace(/_/g, ' ')}</dt>
          <dd className="text-on-surface">{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function FlagCard({ flag, onAnswered }: { flag: OpFlag; onAnswered: () => void }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<FlagResponseKind | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [sent, setSent] = useState<{ response: FlagResponseKind; text: string } | null>(null);
  const answered = flag.response ?? sent?.response ?? null;
  const commentId = `flag-comment-${flag.ticket_id}`;

  const respond = async (response: FlagResponseKind) => {
    setBusy(response);
    setFailed(null);
    try {
      const r = await opApi.respondFlag(flag.ticket_id, response, comment);
      const who = r?.notified_users?.length ? r.notified_users.map((u) => u.name ?? u.user_id).join(', ') : (r?.notified_user_ids ?? []).join(', ');
      setSent({
        response,
        text: who ? `Sent to ${who} with the evidence.` : (r?.message ?? r?.detail ?? 'Sent to your supervisor with the evidence.'),
      });
      setComment('');
      onAnswered();
    } catch (e) {
      setFailed(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className={cx('panel border-l-4 p-4', answered ? 'border-l-success' : 'border-l-warning')} aria-labelledby={`flag-${flag.ticket_id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityChip severity={flag.severity} />
        <SimulatedChip source={flag.source ?? 'SIMULATED'} />
        <span className="font-display text-label-sm uppercase text-on-surface-muted">{kindLabel(flag.kind)}</span>
      </div>

      <h3 id={`flag-${flag.ticket_id}`} className="mt-2 font-display text-headline-sm text-on-surface">
        {flag.title}
      </h3>
      {flag.detail && <p className="mt-1 text-body-lg text-on-surface-variant">{flag.detail}</p>}

      <dl className="mt-3 space-y-1 text-body-md text-on-surface-variant">
        <div className="flex items-center gap-2">
          <Icon name="schedule" size={22} className="text-on-surface-muted" />
          <dt className="sr-only">Recorded</dt>
          <dd>
            Recorded <GmtTime ts={flag.created_at} gmt={flag.created_at_gmt} mode="datetime" missing="time not recorded" />
          </dd>
        </div>
        {flag.machine_id && (
          <div className="flex items-center gap-2">
            <Icon name="precision_manufacturing" size={22} className="text-on-surface-muted" />
            <dt className="sr-only">Machine</dt>
            <dd>{flag.machine_id}</dd>
          </div>
        )}
        {typeof flag.distance_m === 'number' && (
          <div className="flex items-center gap-2">
            <Icon name="social_distance" size={22} className="text-on-surface-muted" />
            <dt className="sr-only">How close</dt>
            <dd>{fmtMetres(flag.distance_m)} from the machine</dd>
          </div>
        )}
      </dl>

      <EvidenceRows evidence={flag.evidence} />

      {answered ? (
        <Note tone="ok" icon="how_to_reg" title={`Your answer is on the record: “${ANSWER_LABEL[answered]}”`}>
          {sent?.text ?? 'Sent to your supervisor with the evidence.'}
          {flag.responded_at || flag.responded_at_gmt ? (
            <>
              {' '}
              Recorded <GmtTime ts={flag.responded_at} gmt={flag.responded_at_gmt} mode="datetime" />.
            </>
          ) : null}
          {flag.response_comment ? <span className="mt-1 block">You wrote: “{flag.response_comment}”</span> : null}
        </Note>
      ) : (
        <div className="mt-4 border-t border-outline pt-4">
          <h4 className="font-display text-label-lg uppercase text-on-surface-muted">Was this right?</h4>
          <p className="mt-1 text-body-md text-on-surface-variant">
            Your answer is <span className="font-semibold">added to the record</span> beside the detection — it does not remove it. Either
            answer is sent to your supervisor together with the evidence above, under your name and the server's GMT time. Saying no is
            not a complaint: it is your account of what happened, and the supervisor reads both.
          </p>

          <label htmlFor={commentId} className="mt-3 block text-body-md text-on-surface-variant">
            Anything you want to add (optional)
          </label>
          <textarea
            id={commentId}
            className="input mt-1 h-auto py-3 text-body-lg"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What you saw, or why you think this is wrong."
          />

          <div className="mt-3 space-y-3">
            <Button
              variant="primary"
              size="lg"
              icon="check_circle"
              block
              className={cx('h-16', TOUCH_BIG)}
              disabled={busy !== null}
              onClick={() => void respond('acknowledged')}
            >
              {busy === 'acknowledged' ? 'Sending…' : ANSWER_LABEL.acknowledged}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              icon="cancel"
              block
              className={cx('h-16', TOUCH_BIG)}
              disabled={busy !== null}
              onClick={() => void respond('disputed')}
            >
              {busy === 'disputed' ? 'Sending…' : ANSWER_LABEL.disputed}
            </Button>
          </div>

          {failed && (
            <Note tone="danger" icon="error" title="Your answer was not recorded" role="alert">
              {failed} Nothing was sent — try again when you have a signal.
            </Note>
          )}
        </div>
      )}

      <p className="mt-3 font-mono text-body-sm text-on-surface-muted">{flag.ticket_id}</p>
    </article>
  );
}

/**
 * The list. A missing endpoint or a failed call says so — it never shows an empty list as if there
 * were nothing to answer.
 */
export function FlagResponsePanel() {
  const r = useResource<OpFlag[]>(() => opApi.flags(), [], POLL.operator);
  const flags = r.data ?? [];
  const waiting = flags.filter((f) => !f.response);

  if (r.loading && !r.data) return <TcLoading label="Loading flags about you" />;
  if (r.error && !r.data) return <TcError error={r.error} what="Flags waiting for your answer" onRetry={r.reload} />;

  return (
    <section className="space-y-3" aria-label="Flags waiting for your answer">
      <div>
        <h2 className="font-display text-label-lg uppercase text-on-surface-muted">
          Flags about you {waiting.length > 0 ? `· ${waiting.length} waiting for your answer` : ''}
        </h2>
        <p className="mt-1 text-body-md text-on-surface-muted">
          Raised by a detector, not by a person. You are asked for your account of it; what you say is added to the record and read by
          your supervisor.
        </p>
      </div>
      {flags.length === 0 ? (
        <div className="panel">
          <TcEmpty icon="verified_user" title="Nothing is waiting for your answer">
            If a detector flags something about you — someone close to your machine, for instance — it appears here for you to confirm or
            dispute.
          </TcEmpty>
        </div>
      ) : (
        flags.map((f) => <FlagCard key={f.ticket_id} flag={f} onAnswered={r.reload} />)
      )}
    </section>
  );
}

export default FlagResponsePanel;
