import { Link, useNavigate } from 'react-router-dom';
import { Button, Icon } from '../components/ui';
import { setRole, type Role } from '../lib/persona';

const PERSONAS: Array<{ role: Role; name: string; line: string; icon: string; to: string }> = [
  { role: 'operator', name: 'Operator Ravi', line: 'In-cab copilot, practice and training', icon: 'engineering', to: '/cab/start' },
  { role: 'supervisor', name: 'Supervisor Priya', line: 'Crew, escalations, idle and competency sign-off', icon: 'supervisor_account', to: '/supervisor' },
];

/** Landing: short hero, three headline gains, persona cards. */
export default function Landing() {
  const nav = useNavigate();
  return (
    <div className="space-y-16 py-4">
      <section className="max-w-3xl">
        <h1 className="font-display text-display">Safer operators, faster to proficient.</h1>
        <p className="mt-4 text-body-lg text-on-surface-variant">A safety-first copilot for excavator operators that turns what happens on the machine into targeted training.</p>
        <div className="mt-8 flex gap-4">
          <Button variant="primary" size="lg" icon="play_arrow" onClick={() => nav('/tour')}>
            Start the demo tour
          </Button>
          <Button variant="secondary" size="lg" onClick={() => nav('/training/effectiveness')}>
            See training results
          </Button>
        </div>
      </section>


      <section>
        <h2 className="mb-6 font-display text-headline-md">Explore as</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {PERSONAS.map((p) => (
            <Link key={p.role} to={p.to} onClick={() => setRole(p.role)} className="panel group flex flex-col gap-3 p-6 transition-colors hover:bg-surface-container-high">
              <Icon name={p.icon} size={32} className="text-on-surface-muted" />
              <span className="font-display text-headline-sm">{p.name}</span>
              <span className="text-body-md text-on-surface-muted">{p.line}</span>
              <Icon name="arrow_forward" className="mt-auto text-on-surface-muted transition-transform group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
