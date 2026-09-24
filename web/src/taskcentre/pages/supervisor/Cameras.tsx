/**
 * `/tc/sup/cameras` — the cameras on this supervisor's machines (GET /tc/sup/cameras).
 *
 * A tile shows the still staged for that camera (`media/cameras/<camera_id>/still.*`) when one
 * exists, and an explicit empty state when one does not. **No tile ever implies a live picture:**
 * a staged frame is captioned as staged, and a camera with nothing behind it says so rather than
 * showing a decorative placeholder that a viewer could mistake for a feed.
 */
import { Link } from 'react-router-dom';
import { sup } from '../../api';
import { LocalTime, SimulatedChip, StaleBadge } from '../../components';
import { CameraStill, cameraKind } from '../../components/CameraStill';
import { POLL, PROTOTYPE_NOTE, STALE } from '../../constants';
import type { Camera } from '../../types';
import { PageTitle } from '../../../components/ui';
import { useNow, useResource } from '../../../lib/hooks';
import { Card, Caveat, Chip, EmptyState, Icon, gate } from './common';

export default function Cameras() {
  const now = useNow(5_000) / 1000;
  const cams = useResource(() => sup.cameras(), [], POLL.supervisor);
  const cameras = cams.data ?? [];

  return (
    <div className="space-y-8">
      <div>
        <Link to="/tc/sup" className="inline-flex items-center gap-1 text-body-sm font-semibold text-notice-dark hover:underline">
          <Icon name="arrow_back" size={18} /> My team
        </Link>
      </div>

      <PageTitle
        title="Cameras"
        sub="Cameras on the machines you supervise. No live video is streamed or recorded here — each tile says exactly what it is showing. Times are shown in your own timezone."
      />

      <Card title={cameras.length ? `${cameras.length} camera${cameras.length === 1 ? '' : 's'}` : 'Cameras'}>
        {gate(cams, 'These cameras', 'Loading cameras') ??
          (cameras.length === 0 ? (
            <EmptyState icon="videocam_off" title="No cameras on your machines">
              Cameras appear here once one is registered against a machine you supervise.
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {cameras.map((c) => (
                <CameraTile key={c.camera_id} cam={c} now={now} />
              ))}
            </div>
          ))}
      </Card>

      <Caveat icon="privacy_tip">
        Camera observations reach you as review flags for a person to judge. {PROTOTYPE_NOTE}
      </Caveat>
    </div>
  );
}

function CameraTile({ cam, now }: { cam: Camera; now: number }) {
  const kind = cameraKind(cam);
  return (
    <article className="border border-outline bg-surface-container-low">
      <CameraStill cam={cam} />

      <div className="space-y-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-headline-sm text-on-surface">{cam.label}</h3>
          {kind === 'simulated' ? (
            <SimulatedChip />
          ) : kind === 'unavailable' ? (
            <Chip tone="red" icon="videocam_off">
              Unavailable
            </Chip>
          ) : (
            <Chip tone="orange" icon="link_off">
              No stream
            </Chip>
          )}
        </div>
        <p className="text-body-sm text-on-surface-muted">
          {cam.camera_id}
          {cam.machine_id ? ` · machine ${cam.machine_id}` : ' · not attached to a machine'}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-body-sm text-on-surface-muted">
          <span>Last frame:</span>
          <LocalTime ts={cam.last_frame_ts} gmt={cam.last_frame_gmt} mode="datetime" missing="never" />
          <StaleBadge ts={cam.last_frame_ts ?? null} now={now} thresholdS={STALE.camera_s} label="frame" />
        </div>
      </div>
    </article>
  );
}
