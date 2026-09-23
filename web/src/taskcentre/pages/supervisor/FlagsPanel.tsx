/**
 * The review queue, as the tall right-hand column of the supervisor's screen.
 *
 * Written in the site's body font rather than the condensed uppercase used elsewhere: this column is
 * read as prose — what was flagged, about whom, when — and uppercase condensed text is for labels
 * and signal words, not for sentences.
 *
 * Severity still carries a word and a shape as well as a colour, so it survives being printed, being
 * looked at in sunlight, and being read by somebody who cannot separate red from green.
 */
import { Link } from 'react-router-dom';
import { ticketSubject } from '../../api';
import { GmtTime, SimulatedChip, kindLabel } from '../../components';
import type { Severity, Ticket } from '../../types';
import { Button, Icon } from '../../../components/ui';
import { cx } from './common';

/** Colour is never the only cue: each severity also has its own icon and its own word. */
const SEV: Record<string, { label: string; icon: string; dot: string; text: string }> = {
  critical: { label: 'Critical', icon: 'emergency_home', dot: 'bg-danger', text: 'text-danger-text' },
  high: { label: 'High', icon: 'error', dot: 'bg-warning', text: 'text-warning-text' },
  medium: { label: 'Medium', icon: 'warning', dot: 'bg-caution', text: 'text-caution-text' },
  low: { label: 'Low', icon: 'info', dot: 'bg-notice', text: 'text-notice-dark' },
};
const ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];
const rank = (s?: string) => {
  const i = ORDER.indexOf((s ?? 'low') as Severity);
  return i === -1 ? ORDER.length : i;
};

/**
 * The person a flag is about, or nothing.
 *
 * Where the subject cannot be resolved the row says nothing rather than "Unknown": these titles
 * already name the person, and a confident "Unknown" beside a name reads as a broken system.
 */
function subjectOf(t: Ticket, nameOf: (id?: string | null) => string): string | undefined {
  const { id, name } = ticketSubject(t);
  if (name) return name;
  if (!id) return undefined;
  const looked = nameOf(id);
  return looked === 'Unknown' || looked === id ? undefined : looked;
}

/**
 * The open flags, worst first. Exported so the mobile trigger can say how many are waiting and how
 * bad the worst one is without opening the drawer — a button that only says "Flags" gives a
 * supervisor no reason to press it.
 */
export function openFlags(tickets: Ticket[]): Ticket[] {
  return [...tickets]
    .filter((t) => t.status === 'open')
    .sort((a, b) => rank(a.severity) - rank(b.severity) || (b.created_at ?? 0) - (a.created_at ?? 0));
}

/** The label and tone for the worst open flag, for that trigger. */
export function worstFlag(tickets: Ticket[]): { label: string; icon: string; dot: string; text: string } | null {
  const first = openFlags(tickets)[0];
  return first ? (SEV[first.severity ?? 'low'] ?? SEV.low) : null;
}

export function FlagsPanel({
  tickets,
  nameOf,
  blocked,
  embedded = false,
}: {
  tickets: Ticket[];
  nameOf: (id?: string | null) => string;
  blocked?: React.ReactNode;
  /** Inside the mobile drawer, which already supplies the frame and the title. */
  embedded?: boolean;
}) {
  const open = openFlags(tickets);
  const counts = ORDER.map((s) => ({ s, n: open.filter((t) => t.severity === s).length })).filter((c) => c.n > 0);

  return (
    <section className={cx('flex flex-col', embedded ? 'h-full -mx-6 -my-4' : 'panel h-full min-h-[320px]')}>
      {!embedded && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-outline px-5 py-4">
          <div>
            <h2 className="font-body text-body-lg font-bold text-on-surface">Flags for review</h2>
            <p className="text-body-sm text-on-surface-muted">Raised by the detectors, location and task times. You decide.</p>
          </div>
          <span className={cx('tnum text-headline-sm font-bold', open.length > 0 ? 'text-on-surface' : 'text-on-surface-muted')}>
            {open.length}
          </span>
        </div>
      )}

      {blocked ? (
        <div className="p-5">{blocked}</div>
      ) : open.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <Icon name="check_circle" size={32} className="text-success-text" />
          <p className="text-body-md text-on-surface">Nothing waiting for you.</p>
          <p className="text-body-sm text-on-surface-muted">Flags you have confirmed or dismissed stay in the queue history.</p>
        </div>
      ) : (
        <>
          {counts.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-outline px-5 py-2.5">
              {counts.map(({ s, n }) => {
                const m = SEV[s] ?? SEV.low;
                return (
                  <span key={s} className="flex items-center gap-1.5 text-body-sm">
                    <span className={cx('h-2 w-2 shrink-0 rounded-full', m.dot)} aria-hidden />
                    <span className="text-on-surface-variant">{m.label}</span>
                    <span className="tnum font-semibold text-on-surface">{n}</span>
                  </span>
                );
              })}
            </div>
          )}

          <ul className="min-h-0 flex-1 divide-y divide-outline overflow-y-auto">
            {open.map((t) => {
              const m = SEV[t.severity ?? 'low'] ?? SEV.low;
              return (
                <li key={t.ticket_id}>
                  <Link to="review" className="flex gap-3 px-5 py-3.5 hover:bg-surface-container-high">
                    <Icon name={m.icon} size={20} className={cx('mt-0.5 shrink-0', m.text)} title={m.label} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-body-md font-semibold text-on-surface">{t.title}</span>
                        <SimulatedChip source={t.source} />
                      </span>
                      <span className="mt-0.5 block text-body-sm text-on-surface-muted">
                        {kindLabel(t.kind)}
                        {subjectOf(t, nameOf) ? ` · ${subjectOf(t, nameOf)}` : ''}
                      </span>
                      <span className="mt-0.5 block text-body-sm text-on-surface-muted">
                        <GmtTime ts={t.created_at} gmt={t.created_at_gmt} mode="smart" />
                      </span>
                    </span>
                    <Icon name="chevron_right" size={18} className="mt-1 shrink-0 text-on-surface-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="flex flex-wrap gap-2 border-t border-outline px-5 py-3.5">
        <Link to="review">
          <Button size="sm" icon="rule">
            Open queue
          </Button>
        </Link>
        <Link to="cameras">
          <Button size="sm" icon="videocam">
            Cameras
          </Button>
        </Link>
      </div>
    </section>
  );
}

export default FlagsPanel;
