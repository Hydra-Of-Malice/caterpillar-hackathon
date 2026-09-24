import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from './components/ui';
import { RequireRole } from './taskcentre/auth';
import { TcLayout } from './taskcentre/components/TcLayout';
import TcLanding from './taskcentre/pages/Landing';
import TcLogin from './taskcentre/pages/Login';
import TcDemo from './taskcentre/pages/Demo';
import TcNotFound from './taskcentre/pages/NotFound';
import TcAdminHome from './taskcentre/pages/admin/AdminHome';
import TcAdminForesight from './taskcentre/pages/admin/Foresight';
import TcAdminMachine from './taskcentre/pages/admin/MachineDetail';
import TcSupDashboard from './taskcentre/pages/supervisor/Dashboard';
import TcSupOperator from './taskcentre/pages/supervisor/OperatorDetail';
import TcSupReview from './taskcentre/pages/supervisor/ReviewQueue';
import TcSupEfficiency from './taskcentre/pages/supervisor/Efficiency';
import TcSupCameras from './taskcentre/pages/supervisor/Cameras';
import TcOpToday from './taskcentre/pages/operator/Today';
import TcOpTask from './taskcentre/pages/operator/TaskDetail';
import TcOpTraining from './taskcentre/pages/operator/Training';
import TcOpChecklist from './taskcentre/pages/operator/Checklist';

/**
 * The app is the AI Task Centre under `/tc`. The earlier copilot screens (`/`, `/cab`, `/training`,
 * `/tour`, ...) are no longer served: any path outside `/tc` redirects there.
 */
export default function App() {
  return (
    <>
      <Routes>
        <Route path="/tc" element={<TcLayout />}>
          <Route index element={<TcLanding />} />
          <Route path="login" element={<Navigate to="/tc" replace />} />
          <Route path="login/:role" element={<TcLogin />} />
          <Route path="admin" element={<RequireRole roles={['admin']}><TcAdminHome /></RequireRole>} />
          <Route path="admin/foresight" element={<RequireRole roles={['admin']}><TcAdminForesight /></RequireRole>} />
          <Route path="admin/machines/:id" element={<RequireRole roles={['admin']}><TcAdminMachine /></RequireRole>} />
          <Route path="sup" element={<RequireRole roles={['supervisor', 'admin']}><TcSupDashboard /></RequireRole>} />
          <Route path="sup/review" element={<RequireRole roles={['supervisor', 'admin']}><TcSupReview /></RequireRole>} />
          <Route path="sup/cameras" element={<RequireRole roles={['supervisor', 'admin']}><TcSupCameras /></RequireRole>} />
          <Route path="sup/efficiency" element={<RequireRole roles={['supervisor', 'admin']}><TcSupEfficiency /></RequireRole>} />
          <Route path="sup/operator/:id" element={<RequireRole roles={['supervisor', 'admin']}><TcSupOperator /></RequireRole>} />
          <Route path="op" element={<RequireRole roles={['operator']}><TcOpToday /></RequireRole>} />
          <Route path="op/task/:id" element={<RequireRole roles={['operator']}><TcOpTask /></RequireRole>} />
          <Route path="op/task/:id/checklist" element={<RequireRole roles={['operator']}><TcOpChecklist /></RequireRole>} />
          <Route path="op/training" element={<RequireRole roles={['operator']}><TcOpTraining /></RequireRole>} />
          <Route path="demo" element={<RequireRole roles={['admin', 'supervisor', 'operator']}><TcDemo /></RequireRole>} />
          <Route path="*" element={<TcNotFound />} />
        </Route>

        <Route path="*" element={<Navigate to="/tc" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
