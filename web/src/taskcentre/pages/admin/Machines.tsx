/**
 * Admin — machines and cameras. Every row says how old its reading is; a stale row is marked
 * stale rather than shown as if it were current, and no camera pretends to carry live video.
 */
import { Card, TABLE, TableWrap } from '../../../components/ops/layout';
import { Icon, cx } from '../../../components/ui';
import { STALE } from '../../constants';
import { LocalTime } from '../../components/LocalTime';
import { NotAvailable, TcEmpty } from '../../components/States';
import { StaleBadge } from '../../components/Badges';
import type { Camera, MachineStatus } from '../../types';

const STATUS_TONE: Record<string, string> = {
  active: 'text-success-text',
  idle: 'text-on-surface-variant',
  fault: 'text-danger-text',
  offline: 'text-on-surface-muted',
};

export function MachinesPanel({ machines, now }: { machines: MachineStatus[]; now: number }) {
  return (
    <Card title="Machines" sub={`${machines.length} on site · status and reading age`}>
      {machines.length === 0 ? (
        <TcEmpty icon="agriculture" title="No machines reported">
          The API returned no machines for this site. Nothing is filled in on their behalf.
        </TcEmpty>
      ) : (
        <TableWrap>
          <table className={cx(TABLE, 'min-w-[720px]')}>
            <thead>
              <tr>
                <th>Unit</th>
                <th>Status</th>
                <th>Operator</th>
                <th>Last reading</th>
                <th>Freshness</th>
                <th>Open flags</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((m) => (
                <tr key={m.machine_id}>
                  <td>
                    <span className="font-display text-label-md uppercase">{m.machine_id}</span>
                    {m.label && <span className="block text-body-sm text-on-surface-muted">{m.label}</span>}
                  </td>
                  <td>
                    <span className={cx('font-display text-label-md uppercase', STATUS_TONE[m.status ?? ''] ?? 'text-on-surface-variant')}>
                      <Icon name={m.status === 'fault' ? 'error' : m.status === 'active' ? 'play_circle' : m.status === 'offline' ? 'cloud_off' : 'pause_circle'} size={16} className="align-[-3px]" />{' '}
                      {m.status ?? 'unknown'}
                    </span>
                    {m.detail && <span className="block text-body-sm text-on-surface-muted">{m.detail}</span>}
                  </td>
                  <td className="text-body-md">{m.operator_name ?? m.operator_id ?? <span className="text-on-surface-muted">—</span>}</td>
                  <td>
                    <LocalTime ts={m.last_seen_ts} gmt={m.last_seen_gmt} mode="smart" />
                  </td>
                  <td>
                    <StaleBadge ts={m.last_seen_ts} thresholdS={STALE.machine_s} now={now} label="machine reading" />
                  </td>
                  <td className="tnum">
                    {(m.open_tickets ?? 0) + (m.open_incidents ?? 0) === 0 ? (
                      <span className="text-on-surface-muted">none</span>
                    ) : (
                      <>
                        {m.open_tickets ? `${m.open_tickets} ticket${m.open_tickets === 1 ? '' : 's'}` : ''}
                        {m.open_tickets && m.open_incidents ? ' · ' : ''}
                        {m.open_incidents ? `${m.open_incidents} incident${m.open_incidents === 1 ? '' : 's'}` : ''}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}

export function CamerasPanel({ cameras, now }: { cameras: Camera[]; now: number }) {
  return (
    <Card title="Cameras" sub="This prototype has no video pipeline — each tile states what it actually has">
      {cameras.length === 0 ? (
        <TcEmpty icon="videocam_off" title="No cameras registered">
          The API returned no cameras for this site.
        </TcEmpty>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {cameras.map((c) => (
            <figure key={c.camera_id} className="space-y-2">
              {c.stream_kind === 'simulated' ? (
                <div className="placeholder-media stripes-sim relative flex aspect-video items-center justify-center border border-outline">
                  <div className="flex flex-col items-center gap-1 px-4 text-center">
                    <Icon name="science" size={32} className="text-prov-sim-text" />
                    <span className="font-display text-label-sm uppercase text-on-surface-variant">Simulated feed</span>
                    <span className="text-body-sm text-on-surface-muted">No video is produced. Observations come from the scenario generator.</span>
                  </div>
                </div>
              ) : (
                <NotAvailable
                  className="aspect-video"
                  title={c.stream_kind === 'live' ? 'Live stream not wired' : 'Camera unavailable'}
                  detail={c.stream_kind === 'live' ? 'This camera is marked live, but the prototype has no video pipeline to show it.' : 'The camera reported itself unavailable.'}
                />
              )}
              <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-display text-label-md uppercase">{c.label}</span>
                {c.machine_id && <span className="text-body-sm text-on-surface-muted">{c.machine_id}</span>}
                <span className="text-body-sm text-on-surface-muted">
                  Last frame <LocalTime ts={c.last_frame_ts} gmt={c.last_frame_gmt} mode="smart" />
                </span>
                <StaleBadge ts={c.last_frame_ts} thresholdS={STALE.camera_s} now={now} label="frame" />
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </Card>
  );
}
