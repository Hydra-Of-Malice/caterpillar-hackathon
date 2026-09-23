import { useState } from 'react';
import { edge } from '../../lib/api';
import { fmtClock } from '../../lib/format';
import { liveNow, useLive } from '../../lib/live';
import type { Incident } from '../../lib/types';
import { ProvenanceBadge } from '../ProvenanceBadge';
import { Button, Icon, Modal, Segmented, cx, toast } from '../ui';

const TYPES: Array<{ id: string; label: string; icon: string }> = [
  { id: 'near_miss', label: 'Near-miss', icon: 'report' },
  { id: 'person_too_close', label: 'Person too close', icon: 'person_alert' },
  { id: 'ground_slope', label: 'Ground / slope issue', icon: 'landslide' },
  { id: 'machine_fault', label: 'Machine fault', icon: 'build' },
  { id: 'damage', label: 'Damage', icon: 'car_crash' },
  { id: 'other', label: 'Other', icon: 'more_horiz' },
];

/** Screen 6 — quick incident / near-miss log (modal sheet over Operate). */
export function IncidentLogModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const live = useLive();
  const [type, setType] = useState<string | null>(null);
  const [severity, setSeverity] = useState<Incident['severity'] | null>(null);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const snap = live.snapshot;
  const machineState = snap ? `${snap.moving ? 'travelling' : 'swinging'}, ${snap.travel_kmh.toFixed(1)} km/h` : 'stationary';

  const reset = () => {
    setType(null);
    setSeverity(null);
    setNote('');
    setShowNote(false);
  };

  const save = async () => {
    if (!type || !severity) return;
    setSaving(true);
    try {
      await edge.createIncident({
        type, severity, source: 'manual', note: note || null, signal_word: 'NOTICE', machine_id: live.machineId, operator_id: 'OP-1042',
        context: { task: snap?.task?.name ?? 'Truck Loading, Bench 3', zone: 'TL-1', machine_state: machineState, ts_local: fmtClock(liveNow()), last_30s_saved: true },
      });
      toast('Saved to incident log · will sync when online');
      reset();
      onClose();
    } catch (e) {
      toast(`Could not save: ${(e as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Log incident / near-miss"
      footer={
        <>
          <Button variant="secondary" size="cab" onClick={() => { reset(); onClose(); }}>
            Cancel
          </Button>
          <Button variant="primary" size="cab" icon="save" disabled={!type || !severity || saving} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <section>
          <div className="mb-3 font-display text-label-lg uppercase text-on-surface-variant">1 · What happened?</div>
          <div className="grid grid-cols-3 gap-4">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                className={cx('flex h-24 flex-col items-center justify-center gap-2 border-2 transition-colors', type === t.id ? 'border-cat bg-cat/10 text-cat-text' : 'border-outline-variant bg-surface-container-high hover:border-outline-strong')}
              >
                <Icon name={t.icon} size={34} />
                <span className="font-display text-label-lg uppercase">{t.label}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="flex items-center justify-between gap-4">
          <div className="font-display text-label-lg uppercase text-on-surface-variant">2 · Severity</div>
          <Segmented
            size="cab"
            value={severity}
            onChange={setSeverity}
            options={[
              { value: 'low', label: 'Low', tone: 'neutral' },
              { value: 'medium', label: 'Medium', tone: 'orange' },
              { value: 'high', label: 'High', tone: 'red' },
            ]}
          />
        </section>
        <section className="border border-outline bg-surface-container-low p-4">
          <div className="mb-2 flex items-center gap-2 font-display text-label-lg uppercase text-on-surface-variant">
            3 · Attached automatically <ProvenanceBadge kind="RULE" />
          </div>
          <ul className="grid grid-cols-2 gap-2 text-body-lg">
            <li className="flex items-center gap-2"><Icon name="schedule" className="text-on-surface-muted" /> {fmtClock(liveNow())}</li>
            <li className="flex items-center gap-2"><Icon name="location_on" className="text-on-surface-muted" /> Bench 3, truck-loading zone</li>
            <li className="flex items-center gap-2"><Icon name="precision_manufacturing" className="text-on-surface-muted" /> Machine: {machineState}</li>
            <li className="flex items-center gap-2"><Icon name="save" className="text-on-surface-muted" /> Last 30 s of machine signals saved</li>
          </ul>
        </section>
        <section className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="lg" icon="mic" className="h-16">
            Add voice note
          </Button>
          <ProvenanceBadge kind="MOCK" />
          <Button variant="secondary" size="lg" icon="edit_note" className="h-16" onClick={() => setShowNote((s) => !s)}>
            Add note
          </Button>
        </section>
        {showNote && <textarea autoFocus rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="input h-auto py-3 text-body-lg" placeholder="What happened? (optional)" />}
      </div>
    </Modal>
  );
}
