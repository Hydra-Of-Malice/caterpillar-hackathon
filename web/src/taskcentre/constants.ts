/**
 * Task Centre constants: product naming, poll intervals, staleness thresholds and storage keys.
 * Everything tunable for the demo lives here so there is exactly one place to change it.
 */
import type { Role } from './types';

// ---------------------------------------------------------------- product
export const PRODUCT_NAME = 'CAT Sentinel — AI Task Centre';
export const PRODUCT_SHORT = 'AI Task Centre';
export const PRODUCT_TAGLINE = 'Worksite safety and task coordination for quarry crews.';

/** Honesty notes reused verbatim across the UI — never soften these. */
export const PRESENCE_NOTE = 'Location indicates presence, not proof.';
export const PROTOTYPE_NOTE =
  'Prototype on simulated detectors and fictional people, machines and sites. It does not control machinery and does not replace site safety procedures.';
export const SIMULATED_NOTE = 'Produced by a simulated detector, not a validated sensor.';

// ---------------------------------------------------------------- polling (ms)
/** Contract: operator 5 s, chat 5 s, supervisor/admin 10 s. No WebSocket in the Task Centre. */
export const POLL = {
  operator: 5_000,
  chat: 5_000,
  supervisor: 10_000,
  admin: 10_000,
  /** Global critical-alarm banner (operator-facing, mounted on every page). */
  alarm: 5_000,
} as const;

// ---------------------------------------------------------------- staleness (seconds)
export const STALE = {
  /** A position older than this is "stale" — treat it as unknown, not as presence. */
  location_s: 600,
  /** Camera frames stop being representative quickly. */
  camera_s: 300,
  /** Machine telemetry / status freshness. */
  machine_s: 600,
} as const;

// ---------------------------------------------------------------- client behaviour
export const REQUEST_TIMEOUT_MS = 10_000;
/** Browser geolocation: give up quickly and send nothing rather than guessing. */
export const GEO_TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------- storage keys
export const TOKEN_KEY = 'tc.token';
export const ROLE_KEY = 'tc.role';
export const ALARM_MUTE_KEY = 'tc.alarmMuted';

// ---------------------------------------------------------------- routes
export const TC_ROOT = '/tc';
export const ROLE_HOME: Record<Role, string> = {
  admin: '/tc/admin',
  supervisor: '/tc/sup',
  operator: '/tc/op',
};
export const loginPath = (role: Role | string): string => `/tc/login/${role}`;

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrator',
  supervisor: 'Supervisor',
  operator: 'Operator',
};

export const ROLE_ICON: Record<Role, string> = {
  admin: 'admin_panel_settings',
  supervisor: 'supervisor_account',
  operator: 'engineering',
};

/** Demo accounts seeded by the backend (site north-quarry). Shown on screen — this is a demo. */
export const DEMO_CREDENTIALS: Record<Role, Array<{ username: string; password: string; note?: string }>> = {
  admin: [{ username: 'admin', password: 'admin123', note: 'Site-wide view' }],
  supervisor: [{ username: 'super1', password: 'super123', note: 'Owns op1, op2, op3' }],
  operator: [
    { username: 'op1', password: 'op123' },
    { username: 'op2', password: 'op123' },
    { username: 'op3', password: 'op123' },
  ],
};
