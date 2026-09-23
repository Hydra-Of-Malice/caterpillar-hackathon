import { createStore, useStore } from './store';

/**
 * Role switcher (SSO/roles are MOCKED in the prototype). The role is sent as actor_role where the
 * contract needs it (e.g. only an instructor may set a competency to DEMONSTRATED).
 */
export type Role = 'operator' | 'trainee' | 'instructor' | 'supervisor' | 'judge';

export interface Persona {
  role: Role;
  name: string;
  id: string;
  title: string;
}

export const PERSONAS: Record<Role, Persona> = {
  operator: { role: 'operator', name: 'Ravi Kumar', id: 'OP-1042', title: 'Operator · 3 months' },
  trainee: { role: 'trainee', name: 'Ravi Kumar', id: 'OP-1042', title: 'Trainee · practice mode' },
  instructor: { role: 'instructor', name: 'Marcus Lee', id: 'INS-01', title: 'Instructor' },
  supervisor: { role: 'supervisor', name: 'Priya Nair', id: 'SUP-01', title: 'Site supervisor' },
  judge: { role: 'judge', name: 'Judge', id: 'JUDGE', title: 'Hackathon judge' },
};

function load(): Role {
  try {
    const r = localStorage.getItem('sentinel.role') as Role | null;
    if (r && r in PERSONAS) return r;
  } catch {
    /* storage unavailable */
  }
  return 'operator';
}

export const personaStore = createStore<Role>(load());

export function setRole(role: Role): void {
  personaStore.set(role);
  try {
    localStorage.setItem('sentinel.role', role);
  } catch {
    /* storage unavailable */
  }
}

export function usePersona(): Persona {
  return PERSONAS[useStore(personaStore)];
}

/** The operator whose data operator/trainee pages show. */
export const DEMO_OPERATOR_ID = 'OP-1042';
