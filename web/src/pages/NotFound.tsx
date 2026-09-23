import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui';

export default function NotFound() {
  return (
    <div className="py-16">
      <EmptyState icon="explore_off" title="Screen not found">
        <Link to="/" className="text-notice-dark underline">Back to the start page</Link> or open the <Link to="/tour" className="text-notice-dark underline">Demo tour</Link>.
      </EmptyState>
    </div>
  );
}
