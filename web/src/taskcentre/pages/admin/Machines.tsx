/**
 * Admin — cameras. Every tile says how old its frame is; a stale tile is marked stale rather than
 * shown as if it were current, and no camera pretends to carry live video. The machines themselves
 * live in the fleet table (`FleetPanel`) and each machine's own page.
 */
import { Card } from '../../../components/ops/layout';
import { STALE } from '../../constants';
import { LocalTime } from '../../components/LocalTime';
import { CameraStill } from '../../components/CameraStill';
import { TcEmpty } from '../../components/States';
import { StaleBadge } from '../../components/Badges';
import type { Camera } from '../../types';

export { FleetPanel } from './FleetPanel';

export function CamerasPanel({ cameras, now }: { cameras: Camera[]; now: number }) {
  return (
    <Card title="Cameras" sub="Staged stills only — no video pipeline. Each tile states what it actually has.">
      {cameras.length === 0 ? (
        <TcEmpty icon="videocam_off" title="No cameras registered">
          The API returned no cameras for this site.
        </TcEmpty>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {cameras.map((c) => (
            <figure key={c.camera_id} className="space-y-2">
              <CameraStill cam={c} />
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
