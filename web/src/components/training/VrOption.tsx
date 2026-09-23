import { useState } from 'react';
import type { TrainingModule } from '../../lib/types';
import { Icon } from '../ui';

const FORMAT: Record<string, string> = { stereo_180: '3D 180°', stereo_360: '3D 360°' };

/**
 * Small "View in VR" option. Shown as available only when the module's demonstration was recorded in
 * 3D (stereoscopic) — flat video cannot give a proper VR view. Prototype placeholder: the 3D
 * recordings are captured in the production phase.
 */
export function VrOption({ vr }: { vr: TrainingModule['vr'] }) {
  const [open, setOpen] = useState(false);
  if (!vr?.available) {
    return (
      <p className="flex items-center gap-2 text-body-sm text-on-surface-muted" title="VR needs a demonstration recorded in 3D (stereoscopic)">
        <Icon name="view_in_ar" size={18} /> VR not available for this module (no 3D recording)
      </p>
    );
  }
  const xr = typeof navigator !== 'undefined' && 'xr' in navigator;
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded border border-outline px-3 py-1.5 text-body-sm text-on-surface hover:bg-surface-container-high" aria-expanded={open}>
        <Icon name="view_in_ar" size={18} /> View in VR <span className="text-on-surface-muted">· {FORMAT[vr.format ?? ''] ?? '3D'}</span>
      </button>
      {open && (
        <div className="mt-2 max-w-xl rounded border border-outline bg-surface-container-low p-4 text-body-sm text-on-surface-variant">
          <p className="font-semibold text-on-surface">{vr.title ?? 'Operator’s-eye view in VR'}</p>
          <p className="mt-1">
            This demonstration is recorded in stereoscopic 3D from the operator’s seat, so it can be watched in a VR headset.
            {xr ? ' Your browser supports WebXR.' : ' Open this page in a WebXR headset browser to view it.'}
          </p>
          <p className="mt-2 text-on-surface-muted">Placeholder — 3D recordings are added in the production phase.</p>
        </div>
      )}
    </div>
  );
}
