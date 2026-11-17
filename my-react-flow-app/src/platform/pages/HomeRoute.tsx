// หน้า "/" : ผู้เยี่ยมชมเห็น GuestHome
// ผู้ที่ login แล้ว: ถ้ามี next ที่เก็บไว้ก่อน login (Google redirect กลับ "/" เสมอ) ให้พากลับหน้าที่ตั้งใจ
// ไม่มี next เห็น Dashboard ตามบทบาท (T17): admin → AdminDashboard, can_teach → InstructorDashboard, อื่นๆ → DashboardPage
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../../auth/AuthContext';
import { roleKey } from '../permissions';
import { takeNext } from '../safeNext';
import AdminDashboard from './AdminDashboard';
import DashboardPage from './DashboardPage';
import GuestHome from './GuestHome';
import InstructorDashboard from './InstructorDashboard';

function SignedInHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showDashboard, setShowDashboard] = useState(false);
  // takeNext ลบค่าทันทีหลังอ่าน และ StrictMode เรียก effect ซ้ำบน instance เดิม ref จึงกันไม่ให้รอบสองอ่านซ้ำ (ได้ null) แล้วข้ามการพากลับ
  const handledRef = useRef(false);
  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;
    const next = takeNext();
    if (next) navigate(next, { replace: true });
    else setShowDashboard(true);
  }, [navigate]);

  if (!showDashboard) return null;
  const role = roleKey(user);
  return role === 'admin' ? <AdminDashboard /> : role === 'instructor' ? <InstructorDashboard /> : <DashboardPage />;
}

export default function HomeRoute() {
  const { user } = useAuth();
  return user ? <SignedInHome /> : <GuestHome />;
}
