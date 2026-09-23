import { createStore, useStore } from './store';

/**
 * Role switcher (SSO/roles are MOCKED in the prototype). Two roles only: the operator in the cab,
 * and the site supervisor, who also carries the instructor duties (competency sign-off, content
 * approval) that a separate instructor role used to hold.
 */
export type Role = 'operator' | 'supervisor';

export interface Persona {
  role: Role;
  name: string;
  id: string;
  title: string;
}

export const PERSONAS: Record<Role, Persona> = {
  operator: { role: 'operator', name: 'Ravi Kumar', id: 'OP-1042', title: 'Operator · 3 months' },
  supervisor: { role: 'supervisor', name: 'Priya Nair', id: 'SUP-01', title: 'Site supervisor' },
};

/** Where each role lands when picked in the header switcher. */
export const ROLE_HOME: Record<Role, string> = {
  operator: '/cab/home',
  supervisor: '/supervisor',
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
