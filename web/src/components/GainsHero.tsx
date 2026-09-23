import { Link } from 'react-router-dom';
import { value as valueApi } from '../lib/api';
import { useResource } from '../lib/hooks';
import { SourceNote } from './ProvenanceBadge';

const PICK = ['trainee_output', 'time_to_proficiency', 'idle_fuel'];

/**
 * Three headline gains (operational units) from GET /value/gains-headline, with their ranges.
 * Gains apply to trainees; money stays on /value.
 */
export function GainsHero() {
  const { data } = useResource(() => valueApi.gainsHeadline(), []);
  const gains = PICK.map((k) => data?.gains.find((g) => g.key === k)).filter((g): g is NonNullable<typeof g> => !!g);
  const split = (h: string) => {
    const m = h.match(/^(\S+ L|\S+)\s+(.*?)(?:\s*\(([^)]*)\))?$/);
    return m ? { big: m[1], rest: m[2], range: m[3] } : { big: h, rest: '', range: undefined };
  };
  return (
    <section>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {gains.map((g) => {
          const h = split(g.headline ?? `${Math.round(g.value)} ${g.unit}`);
          return (
            <div key={g.key}>
              <div className="font-display text-display leading-none text-on-surface">{h.big}</div>
              <div className="mt-2 text-body-lg text-on-surface-variant">{h.rest || g.label}</div>
              {h.range && <div className="text-body-md text-on-surface-muted">range {h.range}</div>}
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-body-md text-on-surface-muted">
        Estimates for trainee operators · prototype data simulated · to be proven in a pilot.{' '}
        <Link to="/value" className="text-notice-dark hover:underline">
          See assumptions
        </Link>
      </p>
      <SourceNote kinds={['ESTIMATE', 'SIMULATED']} />
    </section>
  );
}
