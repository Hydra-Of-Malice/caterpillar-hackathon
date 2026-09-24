/**
 * The picture area of a camera tile, shared by the supervisor's Cameras page and the admin's
 * machines panel.
 *
 * Shared on purpose: these two screens drifted apart once already — one showed staged stills while
 * the other said "camera unavailable" for the same cameras — because each had its own copy of the
 * tile. One component, one behaviour.
 *
 * **A staged still is not a frame.** It is a file somebody put on a disk, so it renders regardless
 * of how old the detector's last frame is, and the caption says what it is over the image itself,
 * where a screenshot cannot crop it out. Frame freshness is a separate fact and stays in the tile's
 * own caption, because "this camera has not reported for 9 hours" is true and worth knowing even
 * while a picture is on screen.
 *
 * With nothing staged, the tile keeps its honest empty state rather than showing decoration.
 */
import { useAuthedMedia } from '../useAuthedMedia';
import type { Camera } from '../types';
import { Icon } from '../../components/ui';
import { NotAvailable } from './States';

/** What a camera says about itself, across the two endpoints that report it differently. */
export function cameraKind(cam: Camera): string {
  return cam.reported_stream_kind ?? cam.stream_kind ?? 'unavailable';
}

const EMPTY: Record<string, { title: string; detail: string }> = {
  simulated: {
    title: 'No frame staged',
    detail: 'Observations from this camera are generated for the demo and labelled SIMULATED. Put a file at media/cameras/<camera_id>/still.jpg to show one here.',
  },
  unavailable: {
    title: 'Camera unavailable',
    detail: 'This camera is not reporting. Nothing is being shown, and nothing is inferred from it.',
  },
  live: {
    title: 'Live stream not wired',
    detail: 'This camera is marked live, but no video pipeline exists in this prototype, so no picture is shown.',
  },
};

export function CameraStill({ cam, className = 'aspect-video' }: { cam: Camera; className?: string }) {
  const still = useAuthedMedia(cam.still_available ? cam.still_url : null);
  const kind = cameraKind(cam);
  const empty = EMPTY[kind] ?? EMPTY.unavailable;

  if (still.loading) {
    return (
      <div className={`flex ${className} items-center justify-center border border-outline bg-surface-container-high`}>
        <span className="text-body-sm text-on-surface-muted">Loading the staged frame…</span>
      </div>
    );
  }

  if (still.url) {
    return (
      <div className={`relative ${className} border border-outline`}>
        <img
          src={still.url}
          alt={`Staged frame for ${cam.label}. Not a live feed.`}
          className="block h-full w-full object-cover"
        />
        <p className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-black/75 px-2.5 py-1.5 text-body-sm text-white">
          <Icon name="science" size={16} />
          Staged frame — not a live feed, nothing is streamed or recorded
        </p>
      </div>
    );
  }

  return (
    <NotAvailable
      className={className}
      icon={kind === 'simulated' ? 'videocam' : 'videocam_off'}
      title={still.error ? 'Frame could not be loaded' : empty.title}
      detail={still.error ?? empty.detail}
    />
  );
}

export default CameraStill;
