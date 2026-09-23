import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DataSourceChip } from '../../components/DataSourceChip';
import { ProvenanceBadge, ProvenanceBadges } from '../../components/ProvenanceBadge';
import { TrainingTabs } from '../../components/office/TrainingTabs';
import { Button, Chip, EmptyState, ErrorNote, Icon, Label, Loading, PageTitle, Panel, PanelHeader, Segmented, cx, toast } from '../../components/ui';
import { cloud } from '../../lib/api';
import { fmtClock, fmtDate } from '../../lib/format';
import { useResource } from '../../lib/hooks';
import { DEMO_OPERATOR_ID } from '../../lib/persona';
import type { Booking as BookingT, Instructor, InstructorSlot } from '../../lib/types';
import { MODULES, competencyLabel } from '../../mocks/world';

type FormatFilter = 'any' | 'on_machine' | 'simulator' | 'video_call';

const FORMAT_META: Record<string, { label: string; icon: string }> = {
  on_machine: { label: 'On machine', icon: 'construction' },
  simulator: { label: 'Simulator', icon: 'sports_esports' },
  video_call: { label: 'Video call', icon: 'videocam' },
};
const fmtLabel = (f: string) => FORMAT_META[f]?.label ?? f;
const fmtIcon = (f: string) => FORMAT_META[f]?.icon ?? 'event';

interface Topic {
  competency_id: string;
  module_id: string;
  label: string;
}

const dayKey = (ts: number) => {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

function initialsOf(i: Instructor): string {
  if (i.initials) return i.initials;
  return (
    i.name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0]?.toUpperCase())
      .join('.') + '.'
  );
}

function slotWhen(s: InstructorSlot): string {
  return `${fmtDate(s.start_ts)} ${fmtClock(s.start_ts)}–${fmtClock(s.end_ts)}`;
}

// ------------------------------------------------------------------ slot chip
function SlotChip({ slot, selected, taken, onSelect }: { slot: InstructorSlot; selected: boolean; taken: boolean; onSelect: () => void }) {
  const unavailable = slot.available === false || taken;
  return (
    <button
      type="button"
      disabled={unavailable}
      aria-pressed={selected}
      onClick={onSelect}
      title={unavailable ? 'Not available' : `${slotWhen(slot)} · ${slot.location ?? fmtLabel(slot.format)}`}
      className={cx(
        'flex min-h-[56px] min-w-[150px] flex-col items-start justify-center gap-0.5 rounded border-2 px-3 py-1.5 text-left transition-colors duration-quick',
        unavailable && 'cursor-not-allowed border-outline border-dashed bg-surface-container-lowest text-on-surface-muted',
        !unavailable && selected && 'border-cat bg-cat/10 text-on-surface',
        !unavailable && !selected && 'border-outline bg-surface-container-low text-on-surface hover:border-outline-strong hover:bg-surface-container-high',
      )}
    >
      <span className={cx('tnum font-display text-label-md', unavailable && 'line-through')}>
        {fmtClock(slot.start_ts)}–{fmtClock(slot.end_ts)}
      </span>
      <span className="flex items-center gap-1 text-footnote text-on-surface-muted">
        <Icon name={fmtIcon(slot.format)} size={14} />
        {unavailable ? 'Booked' : slot.location ?? fmtLabel(slot.format)}
      </span>
    </button>
  );
}

// ------------------------------------------------------------------ instructor card
function InstructorCard({
  instructor, slots, selectedId, taken, onSelect, formatFilter,
}: { instructor: Instructor; slots: InstructorSlot[]; selectedId: string | null; taken: Set<string>; onSelect: (s: InstructorSlot) => void; formatFilter: FormatFilter }) {
  const days = useMemo(() => {
    const m = new Map<string, InstructorSlot[]>();
    for (const s of [...slots].sort((a, b) => a.start_ts - b.start_ts)) {
      const k = dayKey(s.start_ts);
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return Array.from(m.values());
  }, [slots]);
  const offersFormat = formatFilter === 'any' || instructor.formats.includes(formatFilter);
  return (
    <Panel as="article">
      <div className="flex flex-wrap items-start gap-4 border-b border-outline p-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center border-2 border-outline-strong bg-surface-container-highest font-display text-headline-sm text-on-surface" aria-hidden>
          {initialsOf(instructor).replace(/\./g, '')}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-headline-sm uppercase text-on-surface">{instructor.name}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {instructor.specialties.map((s) => (
              <Chip key={s}>{s}</Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {instructor.formats.map((f) => (
            <Chip key={f} icon={fmtIcon(f)} tone={formatFilter === f ? 'blue' : 'neutral'}>
              {fmtLabel(f)}
            </Chip>
          ))}
        </div>
      </div>
      <div className="space-y-3 p-4">
        {!offersFormat ? (
          <p className="text-body-sm text-on-surface-muted">{instructor.name} does not offer {fmtLabel(formatFilter).toLowerCase()} sessions.</p>
        ) : days.length === 0 ? (
          <p className="text-body-sm text-on-surface-muted">No open slots for these filters.</p>
        ) : (
          days.map((d) => (
            <div key={dayKey(d[0].start_ts)} className="flex flex-wrap items-center gap-3">
              <Label className="w-28">{fmtDate(d[0].start_ts)}</Label>
              <div className="flex flex-wrap gap-2">
                {d.map((s) => (
                  <SlotChip key={s.slot_id} slot={s} selected={selectedId === s.slot_id} taken={taken.has(s.slot_id)} onSelect={() => onSelect(s)} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ page
export default function Booking() {
  const [params] = useSearchParams();
  const modsRes = useResource(() => cloud.modules(), []);
  const insRes = useResource(() => cloud.instructors(), []);
  const slotRes = useResource(() => cloud.slots(), []);

  const topics: Topic[] = useMemo(() => {
    const src = modsRes.data?.length ? modsRes.data : MODULES;
    const seen = new Set<string>();
    const out: Topic[] = [];
    for (const m of src) {
      if (seen.has(m.competency_id)) continue;
      seen.add(m.competency_id);
      out.push({ competency_id: m.competency_id, module_id: m.module_id, label: m.title });
    }
    return out;
  }, [modsRes.data]);

  const topicParam = (params.get('topic') ?? '').trim().toLowerCase();
  const initialTopic = topics.find((t) => [t.competency_id, t.module_id, t.label].some((x) => (x ?? '').toLowerCase() === topicParam))?.competency_id ?? 'C04';
  const fp = params.get('format');
  const initialFormat: FormatFilter = fp === 'on_machine' || fp === 'simulator' || fp === 'video_call' ? fp : 'any';

  const [topicId, setTopicId] = useState<string>(initialTopic);
  const [format, setFormat] = useState<FormatFilter>(initialFormat);
  const [day, setDay] = useState<string>('any');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [booking, setBooking] = useState<BookingT | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  // Topic from ?topic= once the module list is known.
  useEffect(() => setTopicId(initialTopic), [initialTopic]);

  const slots = slotRes.data ?? [];
  const instructors = insRes.data ?? [];

  // Pre-select the first open slot of the requested format (simulator by default).
  useEffect(() => {
    if (selectedId || !slots.length) return;
    const want = format === 'any' ? 'simulator' : format;
    const open = [...slots].filter((s) => s.available !== false && !taken.has(s.slot_id)).sort((a, b) => a.start_ts - b.start_ts);
    const pick = open.find((s) => s.format === want) ?? open[0];
    if (pick) setSelectedId(pick.slot_id);
  }, [slots, format, selectedId, taken]);

  const days = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of slots) if (!m.has(dayKey(s.start_ts))) m.set(dayKey(s.start_ts), s.start_ts);
    return Array.from(m.entries()).sort((a, b) => a[1] - b[1]);
  }, [slots]);

  const visible = slots.filter((s) => (format === 'any' || s.format === format) && (day === 'any' || dayKey(s.start_ts) === day));
  const slot = slots.find((s) => s.slot_id === selectedId) ?? null;
  const slotInstructor = slot ? instructors.find((i) => i.instructor_id === slot.instructor_id) : undefined;
  const topic = topics.find((t) => t.competency_id === topicId) ?? { competency_id: 'C04', module_id: 'MOD-SWING-APPROACH', label: 'Approach & Swing Control' };

  const confirm = async () => {
    if (!slot) return;
    setBusy(true);
    setError(undefined);
    try {
      const b = await cloud.book({ operator_id: DEMO_OPERATOR_ID, slot_id: slot.slot_id, competency_id: topic.competency_id, module_id: topic.module_id });
      setBooking(b ?? { booking_id: '—', slot_id: slot.slot_id, operator_id: DEMO_OPERATOR_ID, status: 'confirmed', provenance: ['MOCK'] });
      setTaken((t) => new Set(t).add(slot.slot_id));
      toast('Booked. Added to your shift calendar.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const loading = (insRes.loading && !insRes.data) || (slotRes.loading && !slotRes.data);

  return (
    <div className="space-y-6">
      <TrainingTabs />
      <PageTitle
        kicker="Training · instructor & simulator"
        title="Book an instructor"
        sub="Pick a slot with an instructor for on-machine coaching, a simulator session or a video call."
        right={
          <>
            <ProvenanceBadge kind="MOCK" />
            <DataSourceChip endpoints={['/instructors', '/bookings']} />
          </>
        }
      />

      {/* filters */}
      <Panel className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex min-w-[280px] flex-col gap-1.5">
            <Label>Topic</Label>
            <select className="select" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              {topics.map((t) => (
                <option key={t.competency_id} value={t.competency_id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1.5">
            <Label>Format</Label>
            <Segmented<FormatFilter>
              value={format}
              onChange={setFormat}
              options={[
                { value: 'any', label: 'Any' },
                { value: 'on_machine', label: 'On machine' },
                { value: 'simulator', label: 'Simulator' },
                { value: 'video_call', label: 'Video call' },
              ]}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Date</Label>
          <div className="flex flex-wrap gap-1.5">
            {[['any', 0] as [string, number], ...days].map(([k, ts]) => (
              <button
                key={k}
                type="button"
                aria-pressed={day === k}
                onClick={() => setDay(k)}
                className={cx(
                  'h-11 rounded border px-3 font-display text-label-sm uppercase transition-colors duration-quick',
                  day === k ? 'border-cat bg-cat/10 text-on-surface' : 'border-outline bg-surface-container-low text-on-surface-muted hover:border-outline-strong hover:text-on-surface',
                )}
              >
                {k === 'any' ? 'Any date' : fmtDate(ts)}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-headline-sm uppercase text-on-surface">
              <Icon name="school" size={24} className="text-cat-text" /> Instructors
            </h2>
            <span className="text-body-sm text-on-surface-muted">
              <span className="tnum">{visible.filter((s) => s.available !== false && !taken.has(s.slot_id)).length}</span> open slots
            </span>
          </div>
          {loading ? (
            <Loading label="Loading instructors" />
          ) : instructors.length === 0 ? (
            <EmptyState icon="person_off" title="No instructors available">
              No instructors are assigned to this site yet. Ask your supervisor.
            </EmptyState>
          ) : (
            instructors.map((ins) => (
              <InstructorCard
                key={ins.instructor_id}
                instructor={ins}
                slots={visible.filter((s) => s.instructor_id === ins.instructor_id)}
                selectedId={booking ? null : selectedId}
                taken={taken}
                formatFilter={format}
                onSelect={(s) => {
                  setBooking(null);
                  setError(undefined);
                  setSelectedId(s.slot_id);
                }}
              />
            ))
          )}
        </div>

        {/* confirmation */}
        <aside>
          <Panel className="xl:sticky xl:top-4">
            <span className="absolute left-0 right-0 top-0 h-1 bg-cat" />
            <PanelHeader icon="event_available" title={booking ? 'Booking confirmed' : 'Your booking'} right={<ProvenanceBadge kind="MOCK" />} />
            {booking ? (
              <div className="space-y-4 p-4">
                <div className="flex items-start gap-3 border-2 border-success bg-success/10 p-4" role="status">
                  <Icon name="check_circle" size={32} fill className="text-success-text" />
                  <div>
                    <div className="font-display text-label-lg uppercase text-on-surface">Booked. Added to your shift calendar.</div>
                    <div className="mt-1 text-body-sm text-on-surface-variant">
                      Booking <span className="tnum font-semibold text-on-surface">{booking.booking_id}</span> · {booking.status}
                    </div>
                  </div>
                </div>
                {slot && (
                  <dl className="space-y-2 text-body-sm">
                    <div>
                      <dt className="font-display text-label-sm uppercase text-on-surface-muted">When</dt>
                      <dd className="tnum text-on-surface">{slotWhen(slot)}</dd>
                    </div>
                    <div>
                      <dt className="font-display text-label-sm uppercase text-on-surface-muted">With</dt>
                      <dd className="text-on-surface">
                        {slotInstructor?.name ?? slot.instructor_id} · {slot.location ?? fmtLabel(slot.format)}
                      </dd>
                    </div>
                  </dl>
                )}
                <ProvenanceBadges kinds={booking.provenance?.length ? booking.provenance : ['MOCK']} />
                <p className="text-footnote text-on-surface-muted">Calendar integration is a placeholder (MOCK). No invite is sent.</p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    to="/training"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded border-2 border-outline-strong bg-surface-container-high px-4 font-display text-label-md font-bold uppercase tracking-wider text-on-surface hover:bg-surface-container-highest"
                  >
                    <Icon name="arrow_back" size={20} /> Training Hub
                  </Link>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setBooking(null);
                      setSelectedId(null);
                    }}
                  >
                    Book another
                  </Button>
                </div>
              </div>
            ) : !slot ? (
              <div className="p-4">
                <EmptyState icon="touch_app" title="Pick a time slot">
                  Choose an open slot on the left to see the summary here.
                </EmptyState>
              </div>
            ) : (
              <div className="space-y-4 p-4">
                <div>
                  <Label>Selected slot</Label>
                  <div className="mt-1 font-display text-headline-sm text-on-surface">
                    <span className="tnum">{slotWhen(slot)}</span>
                  </div>
                  <div className="font-display text-label-md uppercase text-on-surface-variant">{slot.location ?? fmtLabel(slot.format)}</div>
                </div>
                <dl className="space-y-3 border-y border-outline py-3 text-body-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="font-display text-label-sm uppercase text-on-surface-muted">Instructor</dt>
                    <dd className="text-right text-on-surface">{slotInstructor?.name ?? slot.instructor_id}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="font-display text-label-sm uppercase text-on-surface-muted">Format</dt>
                    <dd className="flex items-center gap-1 text-right text-on-surface">
                      <Icon name={fmtIcon(slot.format)} size={16} /> {fmtLabel(slot.format)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="font-display text-label-sm uppercase text-on-surface-muted">Topic</dt>
                    <dd className="text-right text-on-surface">{topic.label}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="font-display text-label-sm uppercase text-on-surface-muted">Competency</dt>
                    <dd className="text-right text-on-surface-variant">{competencyLabel(topic.competency_id)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="font-display text-label-sm uppercase text-on-surface-muted">Operator</dt>
                    <dd className="text-right text-on-surface-variant">Ravi Kumar · {DEMO_OPERATOR_ID}</dd>
                  </div>
                </dl>
                <p className="text-body-sm text-on-surface-muted">Your instructor sees the linked module and the evidence behind the recommendation — nothing else from your shifts.</p>
                {error !== undefined && <ErrorNote error={error} />}
                <div className="flex items-center gap-2">
                  <Button variant="primary" size="lg" block icon="event_available" disabled={busy || slot.available === false || taken.has(slot.slot_id)} onClick={confirm}>
                    {busy ? 'Booking…' : 'Confirm booking'}
                  </Button>
                  <ProvenanceBadge kind="MOCK" />
                </div>
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
