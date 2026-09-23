/**
 * Task Centre auth: session context, sign-in with an optional browser position fix, and the
 * `<RequireRole>` route guard.
 *
 * Geolocation is requested at sign-in with a short timeout. If the browser denies it or times out
 * we send nothing and the server records the login as "unverified" — coordinates are never
 * fabricated, and a position is an indication of presence, not proof.
 *
 * Permissions are enforced by the API. This guard only keeps the UI honest about what it shows.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button, Icon } from '../components/ui';
import { authApi, getToken, onUnauthorized, requestPosition, setToken, TcApiError } from './api';
import { PRESENCE_NOTE, ROLE_HOME, ROLE_LABEL, loginPath } from './constants';
import type { LoginInfo, LoginResponse, Role, User } from './types';

export type GeoOutcome = 'pending' | 'fixed' | 'unavailable';

interface AuthValue {
  user: User | null;
  token: string | null;
  /** False until the stored token has been checked against the API. */
  ready: boolean;
  /** Where the server said the last sign-in happened (geofence status, server time). */
  loginInfo: LoginInfo | null;
  /** Whether the browser gave us a fix at the last sign-in. */
  geo: GeoOutcome;
  signIn: (username: string, password: string) => Promise<LoginResponse>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <TcAuthProvider>');
  return ctx;
}

/** Convenience for pages that only need the signed-in person. */
export function useCurrentUser(): User | null {
  return useAuth().user;
}

export function TcAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [ready, setReady] = useState(false);
  const [loginInfo, setLoginInfo] = useState<LoginInfo | null>(null);
  const [geo, setGeo] = useState<GeoOutcome>('pending');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The API layer tells us when the server rejected the token (expired 12 h session).
  useEffect(
    () =>
      onUnauthorized(() => {
        if (!mounted.current) return;
        setUser(null);
        setTokenState(null);
      }),
    [],
  );

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setTokenState(null);
      setReady(true);
      return;
    }
    try {
      const me = await authApi.me();
      if (!mounted.current) return;
      setUser(me);
      setTokenState(getToken());
    } catch (e) {
      if (!mounted.current) return;
      // A rejected token means no session. A network failure keeps the token so a reload can retry.
      if (e instanceof TcApiError && (e.status === 401 || e.status === 403)) {
        setToken(null, null);
        setUser(null);
        setTokenState(null);
      }
    } finally {
      if (mounted.current) setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(async (username: string, password: string): Promise<LoginResponse> => {
    setGeo('pending');
    const fix = await requestPosition();
    if (mounted.current) setGeo(fix ? 'fixed' : 'unavailable');
    const res = await authApi.login(username.trim(), password, fix);
    setToken(res.token, res.user.role);
    if (mounted.current) {
      setUser(res.user);
      setTokenState(res.token);
      setLoginInfo(res.login ?? null);
      setReady(true);
    }
    return res;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* the local session is dropped either way */
    }
    setToken(null, null);
    if (mounted.current) {
      setUser(null);
      setTokenState(null);
      setLoginInfo(null);
    }
  }, []);

  const value = useMemo<AuthValue>(() => ({ user, token, ready, loginInfo, geo, signIn, signOut, refresh }), [user, token, ready, loginInfo, geo, signIn, signOut, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Route guard. Not signed in → the sign-in page for the first accepted role.
 * Signed in with the wrong role → a plain permission-denied screen (the API refuses it too).
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, ready } = useAuth();
  const loc = useLocation();

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-on-surface-muted">
        <span className="h-2 w-2 animate-pulse bg-cat" />
        <span className="font-display text-label-md uppercase">Checking your session…</span>
      </div>
    );
  }

  if (!user) return <Navigate to={loginPath(roles[0])} replace state={{ from: loc.pathname }} />;

  if (!roles.includes(user.role)) return <PermissionDenied user={user} needed={roles} />;

  return <>{children}</>;
}

/** Shown when a signed-in person opens a screen their role may not see. */
export function PermissionDenied({ user, needed }: { user: User; needed: Role[] }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const home = ROLE_HOME[user.role];
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="panel rounded-lg p-8">
        <div className="flex items-center gap-3">
          <Icon name="lock" size={32} className="text-warning-text" />
          <h1 className="font-display text-headline-md">Permission denied</h1>
        </div>
        <p className="mt-4 text-body-md text-on-surface-variant">
          You are signed in as <strong>{user.name}</strong> ({ROLE_LABEL[user.role]}). This screen is for{' '}
          {needed.map((r) => ROLE_LABEL[r]).join(' or ')} accounts, and the API refuses the request as well — hiding the link would not be enough.
        </p>
        <p className="mt-2 text-body-sm text-on-surface-muted">{PRESENCE_NOTE}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => navigate(home)} icon="home">
            Go to my {ROLE_LABEL[user.role].toLowerCase()} view
          </Button>
          <Button variant="secondary" onClick={() => void signOut()} icon="logout">
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
