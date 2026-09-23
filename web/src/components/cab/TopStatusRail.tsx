import type { ReactNode } from 'react';
import { useMockStatus } from '../../lib/mockStatus';
import { fmtClock, fmtDur } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import { liveNow, useLive } from '../../lib/live';
import { useShift } from '../../lib/shift';
import { setCabDay, useCabDay } from '../../lib/theme';
import { Icon, Wordmark, cx } from '../ui';

type Tone = 'plain' | 'ok' | 'bad' | 'badfill' | 'warn' | 'off';

function Item({ icon, children, tone = 'plain', title }: { icon: string; children: ReactNode; tone?: Tone; title?: string }) {
  const t = {
    plain: 'text-on-surface',
    ok: 'text-on-surface',
    bad: 'text-danger-text',
    badfill: 'bg-danger text-white px-3',
    warn: 'text-warning-text',
    off: 'text-on-surface-muted',
  }[tone];
  const dot = { plain: null, ok: 'bg-success-text', bad: 'bg-danger-text', badfill: null, warn: 'bg-warning-text', off: 'bg-on-surface-muted' }[tone];
  return (
    <div title={title} className={cx('flex h-10 shrink-0 items-center gap-2 whitespace-nowrap font-display text-label-lg uppercase', t)}>
      {dot ? <span className={cx('h-2.5 w-2.5 rounded-full', dot)} /> : <Icon name={icon} size={22} />}
      {children}
    </div>
  );
}

/**
 * In-cab top status rail (72 px, black): six status items — unit, clock + continuous operation,
 * seatbelt, proximity, protection, connection — plus the Day / Night switch. Shows the
 * PROTECTION DEGRADED hazard band (5f) and the CLOUD OFFLINE line.
 */
export function TopStatusRail() {
  useNow(1000);
  const live = useLive();
  const day = useCabDay();
  const { data: shift } = useShift();
  const ms = useMockStatus();
  const snap = live.snapshot;
  const contMin = snap?.continuous_operation_min ?? shift?.continuous_operation_min ?? null;
  const seatbelt = snap?.seatbelt ?? true;
  const proxFitted = snap?.proximity.fitted ?? shift?.machine.prox_fitted ?? true;
  const proxFault = snap?.proximity.status === 'fault' || /proximity/i.test(live.protection.reason ?? '');
  const degraded = live.protection.state === 'degraded';
  const edgeOnline = live.edgeWs === 'open' || ms.origins.edge === 'online';
  const cloudOffline = live.cloudOffline || live.health?.cloud === 'offline';
  const backlog = live.outboxBacklog || live.health?.outbox_backlog || 0;

  return (
    <header className="theme-dark shrink-0 select-none">
      <div className="h-1 w-full bg-cat" />
      <div className="flex h-[72px] items-center gap-6 bg-black px-6">
        <Wordmark />
        <div className="flex min-w-0 flex-1 items-center gap-6 overflow-hidden whitespace-nowrap">
          <Item icon="precision_manufacturing">{shift?.machine.machine_id ?? live.machineId}</Item>
          <Item icon="schedule" title="Shift clock · continuous operation">
            {fmtClock(liveNow())}
            <span className="text-on-surface-muted">{fmtDur(contMin)}</span>
          </Item>
          <Item icon="airline_seat_recline_normal" tone={seatbelt ? 'ok' : 'badfill'}>
            {seatbelt ? 'Belt on' : 'Belt off'}
          </Item>
          <Item icon="radar" tone={!proxFitted ? 'off' : proxFault ? 'bad' : 'ok'}>
            {!proxFitted ? 'Prox not fitted' : proxFault ? 'Prox fault' : 'Proximity'}
          </Item>
          <Item icon="verified_user" tone={degraded ? 'bad' : live.protection.state === 'active' ? 'ok' : 'off'} title={live.protection.reason ?? 'Independent safety process heartbeat'}>
            {degraded ? 'Protection degraded' : 'Protection'}
          </Item>
          <Item icon="lan" tone={cloudOffline ? 'warn' : edgeOnline ? 'ok' : 'off'}>
            {cloudOffline ? `Offline · ${backlog} queued` : edgeOnline ? 'Online' : 'Edge offline'}
          </Item>
        </div>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => setCabDay(!day)}
            className="flex h-12 items-center gap-2 border border-outline-variant px-3 font-display text-label-md uppercase text-on-surface hover:bg-surface-container-high"
            aria-label={day ? 'Switch to night mode' : 'Switch to day mode'}
          >
            <Icon name={day ? 'dark_mode' : 'light_mode'} size={22} /> {day ? 'Night' : 'Day'}
          </button>
        </div>
      </div>
      {degraded && (
        <div className="stripes-hazard flex h-10 items-center justify-center" role="alert">
          <span className="bg-black px-4 py-1 font-display text-label-lg uppercase text-white">
            Protection degraded — {live.protection.reason ?? 'safety heartbeat lost'} · use mirrors and your spotter
          </span>
        </div>
      )}
      {!degraded && cloudOffline && (
        <div className="flex h-8 items-center justify-center gap-2 bg-warning/20 font-display text-label-md uppercase text-warning-text">
          <Icon name="cloud_off" size={18} /> Cloud offline — {backlog} events queued · safety checks still running on this machine
        </div>
      )}
    </header>
  );
}
