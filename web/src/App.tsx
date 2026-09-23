import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { DemoControlPanel } from './components/DemoControlPanel';
import { StatusPill } from './components/StatusPill';
import { CabLayout } from './components/layout/CabLayout';
import { OfficeLayout } from './components/layout/OfficeLayout';
import { Toaster } from './components/ui';
import { startLive } from './lib/live';
import Landing from './pages/Landing';
import DemoTour from './pages/DemoTour';
import NotFound from './pages/NotFound';
import ShiftStart from './pages/cab/ShiftStart';
import Checklist from './pages/cab/Checklist';
import CabHome from './pages/cab/Home';
import Operate from './pages/cab/Operate';
import BreakScreen from './pages/cab/Break';
import ShiftReviewPage from './pages/cab/Review';
import TrainingHub from './pages/training/TrainingHub';
import ModulePlayer from './pages/training/ModulePlayer';
import Quiz from './pages/training/Quiz';
import Booking from './pages/training/Booking';
import TrainingEffect from './pages/training/TrainingEffect';
import TrainingEffectiveness from './pages/training/TrainingEffectiveness';
import PracticeLive from './pages/practice/PracticeLive';
import PracticeReportPage from './pages/practice/PracticeReport';
import PracticeProgress from './pages/practice/PracticeProgress';
import Incidents from './pages/office/Incidents';
import Tasks from './pages/office/Tasks';
import Anomaly from './pages/office/Anomaly';
import Supervisor from './pages/office/Supervisor';
import Instructor from './pages/office/Instructor';
import Diagnostics from './pages/office/Diagnostics';
import Traceability from './pages/office/Traceability';
import Privacy from './pages/office/Privacy';
// ---- AI Task Centre (additive: new /tc area, existing routes untouched) ----
import { RequireRole } from './taskcentre/auth';
import { TcLayout } from './taskcentre/components/TcLayout';
import TcLanding from './taskcentre/pages/Landing';
import TcLogin from './taskcentre/pages/Login';
import TcDemo from './taskcentre/pages/Demo';
import TcNotFound from './taskcentre/pages/NotFound';
import TcAdminHome from './taskcentre/pages/admin/AdminHome';
import TcSupDashboard from './taskcentre/pages/supervisor/Dashboard';
import TcSupOperator from './taskcentre/pages/supervisor/OperatorDetail';
import TcSupReview from './taskcentre/pages/supervisor/ReviewQueue';
import TcSupCameras from './taskcentre/pages/supervisor/Cameras';
import TcOpToday from './taskcentre/pages/operator/Today';
import TcOpTask from './taskcentre/pages/operator/TaskDetail';
import TcOpTraining from './taskcentre/pages/operator/Training';

export default function App() {
  useEffect(() => startLive('EX-07'), []);
  // The copilot's demo drawer and mock-status pill describe the copilot APIs, not the Task Centre.
  const inTaskCentre = useLocation().pathname.startsWith('/tc');
  return (
    <>
      <Routes>
        {/* ---------------------------------------------- AI Task Centre */}
        <Route path="/tc" element={<TcLayout />}>
          <Route index element={<TcLanding />} />
          <Route path="login" element={<Navigate to="/tc" replace />} />
          <Route path="login/:role" element={<TcLogin />} />
          <Route path="admin" element={<RequireRole roles={['admin']}><TcAdminHome /></RequireRole>} />
          <Route path="sup" element={<RequireRole roles={['supervisor', 'admin']}><TcSupDashboard /></RequireRole>} />
          <Route path="sup/review" element={<RequireRole roles={['supervisor', 'admin']}><TcSupReview /></RequireRole>} />
          <Route path="sup/cameras" element={<RequireRole roles={['supervisor', 'admin']}><TcSupCameras /></RequireRole>} />
          <Route path="sup/operator/:id" element={<RequireRole roles={['supervisor', 'admin']}><TcSupOperator /></RequireRole>} />
          <Route path="op" element={<RequireRole roles={['operator']}><TcOpToday /></RequireRole>} />
          <Route path="op/task/:id" element={<RequireRole roles={['operator']}><TcOpTask /></RequireRole>} />
          <Route path="op/training" element={<RequireRole roles={['operator']}><TcOpTraining /></RequireRole>} />
          <Route path="demo" element={<RequireRole roles={['admin', 'supervisor', 'operator']}><TcDemo /></RequireRole>} />
          <Route path="*" element={<TcNotFound />} />
        </Route>

        <Route path="/cab" element={<CabLayout />}>
          <Route index element={<Navigate to="/cab/home" replace />} />
          <Route path="start" element={<ShiftStart />} />
          <Route path="checklist" element={<Checklist />} />
          <Route path="home" element={<CabHome />} />
          <Route path="operate" element={<Operate />} />
          <Route path="break" element={<BreakScreen />} />
          <Route path="review" element={<ShiftReviewPage />} />
        </Route>
        <Route element={<OfficeLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/tour" element={<DemoTour />} />
          <Route path="/training" element={<TrainingHub />} />
          <Route path="/training/effectiveness" element={<TrainingEffectiveness />} />
          <Route path="/training/module/:id" element={<ModulePlayer />} />
          <Route path="/training/quiz/:id" element={<Quiz />} />
          <Route path="/training/booking" element={<Booking />} />
          <Route path="/training/effect" element={<TrainingEffect />} />
          <Route path="/training/practice" element={<PracticeLive />} />
          <Route path="/training/practice/progress" element={<PracticeProgress />} />
          <Route path="/training/practice/:sessionId" element={<PracticeReportPage />} />
          <Route path="/incidents" element={<Incidents />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/anomaly" element={<Anomaly />} />
          <Route path="/supervisor" element={<Supervisor />} />
          <Route path="/instructor" element={<Instructor />} />
          <Route path="/diagnostics" element={<Diagnostics />} />
          <Route path="/traceability" element={<Traceability />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      {!inTaskCentre && <DemoControlPanel />}
      {!inTaskCentre && <StatusPill />}
      <Toaster />
    </>
  );
}
