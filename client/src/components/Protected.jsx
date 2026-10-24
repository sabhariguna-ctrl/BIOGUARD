import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth.js';

export default function Protected({ children, roles }) {
  const { token, user } = useAuth();
  const loc = useLocation();
  if (!token || !user) return <Navigate to="/welcome" state={{ from: loc }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}
