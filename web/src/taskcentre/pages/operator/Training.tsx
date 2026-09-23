/**
 * `/tc/op/training` — short training clips grouped by category. Everything here is demo content
 * written for this prototype: it is not official Caterpillar training material, and an entry with
 * no video file shows a labelled placeholder rather than pretending to play something.
 */
import { opApi } from '../../api';
import { NotAvailable, TcEmpty, TcError, TcLoading } from '../../components';
import { Chip, Icon } from '../../../components/ui';
import { fmtDur, titleCase } from '../../../lib/format';
import { useResource } from '../../../lib/hooks';
import type { TrainingVideo } from '../../types';
import { Note, OfflineNote, OpPage, useOnline } from './common';

function VideoCard({ v }: { v: TrainingVideo }) {
  return (
    <article className="panel p-4" aria-labelledby={`video-${v.video_id}`}>
      {v.url ? (
        <video className="w-full border border-outline bg-black" controls preload="none" src={v.url} aria-label={`${v.title} — demo clip`}>
          <track kind="captions" />
        </video>
      ) : (
        <NotAvailable
          icon="movie"
          title="No video file"
          detail="This entry has no clip attached. The player is a placeholder — there is nothing to watch yet."
        />
      )}
      <h3 id={`video-${v.video_id}`} className="mt-3 font-display text-headline-sm text-on-surface">
        {v.title}
      </h3>
      {v.description && <p className="mt-1 text-body-lg text-on-surface-variant">{v.description}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Chip icon="schedule">{fmtDur(v.duration_min)}</Chip>
        <Chip icon="science" tone="purple">
          Demo
        </Chip>
      </div>
      <p className="mt-2 text-body-sm text-on-surface-muted">{v.label || 'DEMO placeholder — not official Caterpillar material'}</p>
    </article>
  );
}

export default function Training() {
  const online = useOnline();
  const r = useResource<TrainingVideo[]>(() => opApi.training());

  const videos = [...(r.data ?? [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const categories = [...new Set(videos.map((v) => v.category))];

  return (
    <OpPage title="Training" sub="Short clips you can watch between tasks." back={{ to: '/tc/op', label: 'Today' }}>
      {!online && <OfflineNote />}

      <Note tone="info" icon="info" title="Demo content">
        These clips were made for this prototype. They are not official Caterpillar training material and they do not replace
        your site's safety induction.
      </Note>

      {r.loading && !r.data && <TcLoading label="Loading training" />}
      {r.error && !r.data && <TcError error={r.error} what="Training" onRetry={r.reload} />}

      {r.data && videos.length === 0 && (
        <div className="panel">
          <TcEmpty icon="school" title="No training available yet">
            Nothing has been published for your site.
          </TcEmpty>
        </div>
      )}

      {categories.map((cat) => (
        <section key={cat} className="space-y-3" aria-label={titleCase(cat)}>
          <h2 className="flex items-center gap-2 font-display text-label-lg uppercase text-on-surface-muted">
            <Icon name="folder" size={22} />
            {titleCase(cat)}
          </h2>
          {videos
            .filter((v) => v.category === cat)
            .map((v) => (
              <VideoCard key={v.video_id} v={v} />
            ))}
        </section>
      ))}
    </OpPage>
  );
}
