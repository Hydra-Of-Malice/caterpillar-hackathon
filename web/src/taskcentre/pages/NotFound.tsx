/** Unknown `/tc/*` path. Says so plainly rather than redirecting somewhere the reader did not ask for. */
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../../components/ui';
import { useAuth } from '../auth';
import { ROLE_HOME } from '../constants';

export default function TcNotFound() {
  const loc = useLocation();
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-xl px-2 py-16 text-center">
      <Icon name="explore_off" size={40} className="text-on-surface-muted" />
      <h1 className="mt-3 font-display text-headline-lg">No such Task Centre page</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        <code>{loc.pathname}</code> is not a route in this app.
      </p>
      <p className="mt-4">
        <Link to={user ? ROLE_HOME[user.role] : '/tc'} className="font-semibold text-notice-dark hover:underline">
          {user ? 'Back to your view' : 'Back to the Task Centre'}
        </Link>
      </p>
    </div>
  );
}
