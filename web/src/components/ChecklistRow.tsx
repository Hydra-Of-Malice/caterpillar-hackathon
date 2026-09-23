import type { ReactNode } from 'react';
import type { ChecklistItem, ChecklistResultValue } from '../lib/types';
import { Button, Segmented, cx } from './ui';

/**
 * Pre-shift checklist row (72 px): name + hint + PASS / FAIL / N/A (64 px segments).
 * FAIL expands: defect description, ADD PHOTO (MOCK), "sent to maintenance and supervisor" note.
 */
export function ChecklistRow({
  item, value, note, onChange, onNote, liveValue,
}: {
  item: ChecklistItem; value: ChecklistResultValue | null; note: string; onChange: (v: ChecklistResultValue) => void; onNote: (n: string) => void; liveValue?: ReactNode;
}) {
  const failed = value === 'fail';
  return (
    <div className="panel" style={failed ? { borderColor: '#C52320' } : undefined}>
      <div className="flex min-h-[72px] items-center gap-4 px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className={cx('font-display text-headline-sm', failed && 'text-danger-text')}>{item.label}</div>
          <div className="text-body-md text-on-surface-muted">
            {item.hint}
            {item.critical && <span className="ml-2 font-display text-label-sm uppercase">· critical</span>}
          </div>
        </div>
        {liveValue && <div className="shrink-0">{liveValue}</div>}
        <Segmented
          size="cab"
          value={value}
          onChange={onChange}
          options={[
            { value: 'pass', label: 'Pass', tone: 'green' },
            { value: 'fail', label: 'Fail', tone: 'red' },
            { value: 'na', label: 'N/A', tone: 'neutral' },
          ]}
        />
      </div>
      {failed && (
        <div className="space-y-3 px-4 pb-4">
          <textarea value={note} onChange={(e) => onNote(e.target.value)} rows={2} placeholder="Describe the defect" className="input h-auto min-h-[64px] py-3 text-body-lg" />
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="secondary" size="lg" icon="photo_camera" className="h-16">
              Add photo
            </Button>
            <span className="text-body-md text-danger-text">Sent to maintenance and your supervisor{item.critical ? ' · blocks shift start' : ''}</span>
          </div>
        </div>
      )}
    </div>
  );
}
