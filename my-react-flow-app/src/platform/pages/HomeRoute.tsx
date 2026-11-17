// หน้า "/" : ผู้เยี่ยมชมเห็น GuestHome
// ผู้ที่ login แล้ว: ถ้ามี next ที่เก็บไว้ก่อน login (Google redirect กลับ "/" เสมอ) ให้พากลับหน้าที่ตั้งใจ
// ไม่มี next ให้ไป /lab ชั่วคราวเหมือนของเดิมที่ "/" คือ editor จนกว่า T17 ทำ Dashboard (ผู้ใช้ตัดสินใจหลังจุดตรวจ 1)
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../../auth/AuthContext';
import { takeNext } from '../safeNext';
import GuestHome from './GuestHome';

function SignedInHome() {
  const navigate = useNavigate();
  // takeNext ลบค่าทันทีหลังอ่าน และ StrictMode เรียก effect ซ้ำบน instance เดิม ref จึงกันไม่ให้รอบสองพาไป /lab ทับ
  const handledRef = useRef(false);
  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;
    navigate(takeNext() ?? '/lab', { replace: true });
  }, [navigate]);
  return null;
}

export default function HomeRoute() {
  const { user } = useAuth();
  return user ? <SignedInHome /> : <GuestHome />;
}
