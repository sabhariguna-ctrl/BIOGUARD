import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Protected from './components/Protected.jsx';
import { useAuth } from './store/auth.js';
import { api } from './api/client.js';
import Auth from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Enroll from './pages/Enroll.jsx';
import Exams from './pages/Exams.jsx';
import ExamEditor from './pages/ExamEditor.jsx';
import ExamRoom from './pages/ExamRoom.jsx';
import Results from './pages/Results.jsx';
import Analytics from './pages/Analytics.jsx';
import Evaluate from './pages/Evaluate.jsx';
import Audit from './pages/Audit.jsx';
import Proctor from './pages/Proctor.jsx';
import Users from './pages/Users.jsx';
import FusionLab from './pages/FusionLab.jsx';
import Profile from './pages/Profile.jsx';
import Landing from './pages/Landing.jsx';
import AcceptInvite from './pages/AcceptInvite.jsx';
import Settings from './pages/Settings.jsx';
import InviteStudents from './pages/InviteStudents.jsx';
import Students from './pages/Students.jsx';

export default function App() {
  const refresh = useAuth((s) => s.refresh);
  const token = useAuth((s) => s.token);
  useEffect(() => { refresh(); }, [refresh]);
  // slide the session forward so long exams never hit an expired token
  useEffect(() => {
    if (!token) return;
    const t = setInterval(() => {
      api.post('/auth/refresh').then((r) => { const s = useAuth.getState(); if (s.token) s.setSession(r.data.token, s.user); }).catch(() => {});
    }, 25 * 60 * 1000);
    return () => clearInterval(t);
  }, [token]);
  return (
    <Routes>
      <Route path="/welcome" element={<Landing />} />
      <Route path="/login" element={<Auth />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/exam/:id" element={<Protected roles={['student']}><ExamRoom /></Protected>} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="enroll" element={<Enroll />} />
        <Route path="exams" element={<Exams />} />
        <Route path="exams/new" element={<Protected roles={['admin', 'faculty']}><ExamEditor /></Protected>} />
        <Route path="exams/:id/edit" element={<Protected roles={['admin', 'faculty']}><ExamEditor /></Protected>} />
        <Route path="results" element={<Results />} />
        <Route path="proctor" element={<Protected roles={['admin', 'faculty']}><Proctor /></Protected>} />
        <Route path="analytics" element={<Protected roles={['admin', 'faculty']}><Analytics /></Protected>} />
        <Route path="evaluate" element={<Evaluate />} />
        <Route path="lab" element={<FusionLab />} />
        <Route path="profile" element={<Profile />} />
        <Route path="audit" element={<Protected roles={['admin']}><Audit /></Protected>} />
        <Route path="users" element={<Protected roles={['admin']}><Users /></Protected>} />
        <Route path="students" element={<Protected roles={['admin', 'faculty']}><Students /></Protected>} />
        <Route path="invite" element={<Protected roles={['admin', 'faculty']}><InviteStudents /></Protected>} />
        <Route path="settings" element={<Protected roles={['admin']}><Settings /></Protected>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
