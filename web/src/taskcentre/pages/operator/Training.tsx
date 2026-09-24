/**
 * `/tc/op/training` — the operator's own training record: what they have finished, what is part
 * done, and what a supervisor has put on their list.
 *
 * Two sources, merged on `video_id`: `GET /tc/op/training` is the catalogue (the clip and its
 * description) and `GET /tc/op/training/profile` is this operator's record (status, percent, who
 * assigned it and when). Progress is reported back from the player — `POST
 * /tc/op/training/{video_id}/progress` carries the percentage actually watched — so what is stored
 * is what they did, not what the screen assumed.
 *
 * Everything here is demo content written for this prototype: it is not official Caterpillar
 * training material, and every item says so. An entry with no video file shows a labelled
 * placeholder and records no progress, because there is nothing to watch.
 */
import { useRef, useState } from 'react';
import { TcApiError, errorText, opApi } from '../../api';
import { LocalTime, NotAvailable, TcEmpty, TcError, TcLoading } from '../../components';
import { Chip, Icon, ProgressBar, cx } from '../../../components/ui';
import { fmtDur, titleCase } from '../../../lib/format';
import { useResource } from '../../../lib/hooks';
import type { OpTrainingProfile, TrainingItem, TrainingStatus, TrainingVideo } from '../../types';
import { Note, OfflineNote, OpPage, useOnline } from './common';

const DEMO_LABEL = 'DEMO placeholder — not official Caterpillar material';

/** Report progress at most every 10 percentage points, so a playing clip does not flood the API. */
const REPORT_STEP = 10;

/** Illustrated thumbnails in `public/training/<video_id>.svg`, drawn for this prototype. */
const THUMBNAILS = new Set([
  'vid-walkaround',
  'vid-exclusion',
  'vid-swing',
  'vid-bench',
  'vid-hydraulics',
  'vid-radio',
  'vid-fatigue',
]);

function thumbnailFor(videoId: string): string | null {
  return THUMBNAILS.has(videoId) ? `${import.meta.env.BASE_URL}training/${videoId}.svg` : null;
}

/** The thumbnail where the player would be, with the honest "no clip" note laid over it. */
function Thumbnail({ src, title }: { src: string; title: string }) {
  return (
    <figure className="relative aspect-video w-full overflow-hidden border border-outline bg-black">
      <img src={src} alt={`Illustrated thumbnail: ${title}`} className="h-full w-full object-cover" loading="lazy" />
      <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white/70">
          <Icon name="play_arrow" size={36} />
        </span>
      </span>
      <figcaption className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-black/70 px-3 py-1.5 text-body-sm text-white">
        <Icon name="movie" size={18} />
        No video file yet: thumbnail only, nothing to watch or record.
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------- merging catalogue and record
interface Row {
  video_id: string;
  title: string;
  category: string;
  duration_min: number;
  label: string;
  description: string;
  url: string | null;
  /** This operator's own record for the item, or null when the profile has nothing for it. */
  record: TrainingItem | null;
}

function mergeRows(videos: TrainingVideo[], items: TrainingItem[]): Row[] {
  const byId = new Map(items.map((i) => [i.video_id, i]));
  const rows: Row[] = videos.map((v) => ({
    video_id: v.video_id,
    title: v.title,
    category: v.category,
    duration_min: v.duration_min,
    label: v.label || byId.get(v.video_id)?.label || DEMO_LABEL,
    description: v.description ?? '',
    url: v.url ?? null,
    record: byId.get(v.video_id) ?? null,
  }));
  // An item on the operator's record that the catalogue does not list is still theirs to see.
  const listed = new Set(rows.map((r) => r.video_id));
  for (const i of items) {
    if (listed.has(i.video_id)) continue;
    rows.push({
      video_id: i.video_id,
      title: i.title,
      category: i.category,
      duration_min: i.duration_min,
      label: i.label || DEMO_LABEL,
      description: '',
      url: null,
      record: i,
    });
  }
  return rows;
}

/** What the operator has locally reported since the last poll, so the card updates as they watch. */
interface LocalProgress {
  percent: number;
  completed: boolean;
}

/** The server's record, brought forward by anything reported since. Never invents progress. */
function effective(record: TrainingItem | null, local: LocalProgress | undefined): { status: TrainingStatus; percent: number } {
  const stored = Math.max(0, Math.min(100, Math.round(record?.percent ?? 0)));
  const status = record?.status ?? 'not_started';
  const completed = status === 'completed' || local?.completed === true;
  if (completed) return { status: 'completed', percent: 100 };
  const percent = Math.max(stored, Math.round(local?.percent ?? 0));
  return { status: percent > 0 || status === 'in_progress' ? 'in_progress' : 'not_started', percent };
}

function StatusChip({ status, percent }: { status: TrainingStatus; percent: number }) {
  if (status === 'completed')
    return (
      <Chip icon="check_circle" tone="green">
        Completed
      </Chip>
    );
  if (status === 'in_progress')
    return (
      <Chip icon="pending" tone="yellow">
        In progress · {percent}%
      </Chip>
    );
  return (
    <Chip icon="radio_button_unchecked" tone="neutral">
      Not started
    </Chip>
  );
}

// ---------------------------------------------------------------- one item
function VideoCard({
  row,
  local,
  onReport,
  saveError,
  recording,
}: {
  row: Row;
  local: LocalProgress | undefined;
  onReport: (videoId: string, percent: number, completed: boolean) => void;
  saveError: string | undefined;
  /** False when the profile endpoint is not answering — then nothing can be recorded, and we say so. */
  recording: boolean;
}) {
  const { status, percent } = effective(row.record, local);
  const lastSent = useRef(-1);
  const assigned = Boolean(row.record?.assigned_by);
  const thumbnail = thumbnailFor(row.video_id);

  const report = (pct: number, completed: boolean) => {
    if (!recording) return;
    lastSent.current = Math.max(lastSent.current, pct);
    onReport(row.video_id, pct, completed);
  };

  /** Percentage actually played, read off the element — never estimated. */
  const played = (el: HTMLVideoElement): number | null => {
    if (!Number.isFinite(el.duration) || el.duration <= 0) return null;
    return Math.max(0, Math.min(100, Math.round((el.currentTime / el.duration) * 100)));
  };

  return (
    <article className={cx('panel p-4', assigned && 'border-l-4 border-l-notice')} aria-labelledby={`video-${row.video_id}`}>
      {row.url ? (
        <video
          className="w-full border border-outline bg-black"
          controls
          preload="none"
          src={row.url}
          poster={thumbnail ?? undefined}
          aria-label={`${row.title} — demo clip`}
          onPlay={(e) => report(played(e.currentTarget) ?? 0, false)}
          onTimeUpdate={(e) => {
            const pct = played(e.currentTarget);
            if (pct === null || pct < lastSent.current + REPORT_STEP) return;
            report(pct, false);
          }}
          onEnded={() => report(100, true)}
        >
          <track kind="captions" />
        </video>
      ) : thumbnail ? (
        <Thumbnail src={thumbnail} title={row.title} />
      ) : (
        <NotAvailable
          icon="movie"
          title="No video file"
          detail="This entry has no clip attached. The player is a placeholder — there is nothing to watch yet, so nothing is recorded against it."
        />
      )}

      <h3 id={`video-${row.video_id}`} className="mt-3 font-display text-headline-sm text-on-surface">
        {row.title}
      </h3>
      {row.description && <p className="mt-1 text-body-lg text-on-surface-variant">{row.description}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusChip status={status} percent={percent} />
        <Chip icon="schedule">{fmtDur(row.duration_min)}</Chip>
        <Chip icon="science" tone="purple">
          Demo
        </Chip>
        {assigned && (
          <Chip icon="assignment_ind" tone="blue">
            Assigned by {row.record?.assigned_by}
          </Chip>
        )}
      </div>

      {status === 'in_progress' && percent > 0 && <ProgressBar pct={percent} tone="yellow" height="h-2" className="mt-2" />}

      <dl className="mt-2 space-y-0.5 text-body-md text-on-surface-muted">
        {row.record?.completed_at || row.record?.completed_at_gmt ? (
          <div className="flex flex-wrap gap-x-2">
            <dt>Completed</dt>
            <dd>
              <LocalTime ts={row.record.completed_at} gmt={row.record.completed_at_gmt} mode="datetime" />
            </dd>
          </div>
        ) : row.record?.started_at || row.record?.started_at_gmt ? (
          <div className="flex flex-wrap gap-x-2">
            <dt>Started</dt>
            <dd>
              <LocalTime ts={row.record.started_at} gmt={row.record.started_at_gmt} mode="datetime" />
            </dd>
          </div>
        ) : null}
        {assigned && (row.record?.assigned_at || row.record?.assigned_at_gmt) && (
          <div className="flex flex-wrap gap-x-2">
            <dt>Assigned</dt>
            <dd>
              <LocalTime ts={row.record?.assigned_at} gmt={row.record?.assigned_at_gmt} mode="datetime" />
            </dd>
          </div>
        )}
      </dl>

      <p className="mt-2 text-body-sm text-on-surface-muted">{row.label}</p>

      {saveError && (
        <p className="mt-2 flex items-start gap-2 text-body-sm text-warning-text" role="status">
          <Icon name="sync_problem" size={18} className="mt-0.5" />
          <span>Your progress on this item was not recorded. {saveError}</span>
        </p>
      )}
    </article>
  );
}

// ---------------------------------------------------------------- page
export default function Training() {
  const online = useOnline();
  const catalogue = useResource<TrainingVideo[]>(() => opApi.training());
  const profile = useResource<OpTrainingProfile>(() => opApi.trainingProfile());

  const [local, setLocal] = useState<Record<string, LocalProgress>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

  /** The profile route is being built alongside this screen; until it answers, nothing is claimed. */
  const profileMissing = profile.error instanceof TcApiError && profile.error.missing;
  const recording = Boolean(profile.data) && !profile.error;

  const report = (videoId: string, percent: number, completed: boolean) => {
    setLocal((p) => ({ ...p, [videoId]: { percent: Math.max(percent, p[videoId]?.percent ?? 0), completed: completed || (p[videoId]?.completed ?? false) } }));
    opApi
      .trainingProgress(videoId, completed ? { percent: 100, completed: true } : { percent })
      .then(() => {
        setSaveErrors((p) => {
          if (!p[videoId]) return p;
          const next = { ...p };
          delete next[videoId];
          return next;
        });
        // Only a completion changes the summary enough to be worth a re-read.
        if (completed) profile.reload();
      })
      .catch((e: unknown) => {
        // Drop the optimistic value: it was not stored, so it must not be shown as if it were.
        setLocal((p) => {
          const next = { ...p };
          delete next[videoId];
          return next;
        });
        setSaveErrors((p) => ({ ...p, [videoId]: errorText(e) }));
      });
  };

  const videos = [...(catalogue.data ?? [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const items = profile.data?.items ?? [];
  const rows = mergeRows(videos, items);
  const categories = [...new Set(rows.map((r) => r.category))];

  const summary = profile.data?.summary;
  const total = summary?.total ?? (items.length || null);
  const done = summary?.completed ?? (items.length ? items.filter((i) => i.status === 'completed').length : null);
  const pct =
    summary?.percent_complete ?? (total !== null && done !== null && total > 0 ? (done / total) * 100 : null);
  const assignedOpen = items.filter((i) => i.assigned_by && i.status !== 'completed');
  const assignedAll = items.filter((i) => i.assigned_by);

  return (
    <OpPage title="Training" sub="Your own record — short clips you can watch between tasks." back={{ to: '/tc/op', label: 'Today' }}>
      {!online && <OfflineNote />}

      <Note tone="info" icon="info" title="Demo content">
        These clips were made for this prototype. They are not official Caterpillar training material and they do not replace
        your site's safety induction.
      </Note>

      {/* ---------------------------------------------------------------- your progress */}
      {profile.loading && !profile.data && <TcLoading label="Loading your progress" />}

      {profileMissing && (
        <Note tone="warn" icon="construction" title="Your progress is not available yet">
          The API does not serve a training record for you yet, so nothing below shows how far you have got — and nothing you
          watch here can be recorded. The clips themselves still play.
        </Note>
      )}

      {profile.error && !profileMissing && <TcError error={profile.error} what="Your training progress" onRetry={profile.reload} />}

      {profile.data && (
        <section className="panel space-y-3 p-4" aria-label="Your training progress">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-label-lg uppercase text-on-surface-muted">Your progress</h2>
            {pct !== null && <span className="font-display text-headline-md tnum text-on-surface">{Math.round(pct)}%</span>}
          </div>

          {pct === null ? (
            <p className="text-body-lg text-on-surface-muted">
              Nothing has been recorded against your name yet. Watch a clip below and it will show here.
            </p>
          ) : (
            <>
              <ProgressBar pct={pct} tone={pct >= 100 ? 'green' : 'yellow'} />
              <p className="text-body-lg text-on-surface-variant">
                {done} of {total} completed
                {summary?.in_progress ? ` · ${summary.in_progress} in progress` : ''}
                {summary?.not_started ? ` · ${summary.not_started} not started` : ''}
              </p>
            </>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {summary?.minutes_completed != null && <Chip icon="timelapse">{fmtDur(summary.minutes_completed)} watched</Chip>}
            {(summary?.last_activity_ts || summary?.last_activity_ts_gmt) && (
              <Chip icon="history">
                Last activity <LocalTime ts={summary.last_activity_ts} gmt={summary.last_activity_ts_gmt} mode="datetime" />
              </Chip>
            )}
          </div>

          {assignedAll.length > 0 && (
            <Note
              tone={assignedOpen.length > 0 ? 'warn' : 'ok'}
              icon="assignment_ind"
              title={`${assignedAll.length} item${assignedAll.length === 1 ? '' : 's'} assigned by your supervisor`}
            >
              {assignedOpen.length > 0 ? (
                <>
                  {assignedOpen.length} still to do: {assignedOpen.map((i) => i.title).join(', ')}. They are marked below.
                </>
              ) : (
                <>All of them are complete.</>
              )}
            </Note>
          )}
        </section>
      )}

      {/* ---------------------------------------------------------------- the clips */}
      {catalogue.loading && !catalogue.data && <TcLoading label="Loading training" />}
      {catalogue.error && !catalogue.data && <TcError error={catalogue.error} what="Training" onRetry={catalogue.reload} />}

      {(catalogue.data || profile.data) && rows.length === 0 && (
        <div className="panel">
          <TcEmpty icon="school" title="No training available yet">
            Nothing has been published for your site.
          </TcEmpty>
        </div>
      )}

      {categories.map((cat) => {
        const stat = profile.data?.by_category?.[cat];
        return (
          <section key={cat} className="space-y-3" aria-label={titleCase(cat)}>
            <h2 className="flex flex-wrap items-center gap-2 font-display text-label-lg uppercase text-on-surface-muted">
              <Icon name="folder" size={22} />
              {titleCase(cat)}
              {stat?.total != null && stat.total > 0 && (
                <span className="tnum text-on-surface-variant">
                  {stat.completed ?? 0}/{stat.total} done
                </span>
              )}
            </h2>
            {rows
              .filter((r) => r.category === cat)
              .map((r) => (
                <VideoCard
                  key={r.video_id}
                  row={r}
                  local={local[r.video_id]}
                  onReport={report}
                  saveError={saveErrors[r.video_id]}
                  recording={recording}
                />
              ))}
          </section>
        );
      })}
    </OpPage>
  );
}
