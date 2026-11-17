// หน้า "/" : ผู้เยี่ยมชมเห็น GuestHome, ผู้ที่ login แล้วเห็นหน้าเดิมไปก่อน (T17 ค่อยทำ Dashboard)
// และถ้ามี next ที่เก็บไว้ก่อน login (Google redirect กลับ "/" เสมอ) ให้พากลับหน้าที่ตั้งใจ
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../../auth/AuthContext';
import { NotReadyPage } from '../../pages/StatusPages';
import { takeNext } from '../safeNext';
import GuestHome from './GuestHome';

export default function HomeRoute() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const next = takeNext();
    if (next) navigate(next, { replace: true });
  }, [user, navigate]);

  return user ? <NotReadyPage /> : <GuestHome />;
}
