// route ที่ต้อง login: ถ้ายังไม่ login พาไป /login?next=<path+search> แล้ว LoginPage เก็บ next ไว้กลับมาหลัง login
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { loginPathFor } from './safeNext';

export default function RequireAuth() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to={loginPathFor(`${location.pathname}${location.search}`)} replace />;
  }
  return <Outlet />;
}
