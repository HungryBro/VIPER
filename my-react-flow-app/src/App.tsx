// File: src/App.tsx
// route ราก (T4) editor เดิมย้ายไปอยู่ที่ src/pages/LabPage.tsx (route /lab)
// header/footer/ธีมของแพลตฟอร์มอยู่ใน src/platform/Layout.tsx (T6) ซึ่งครอบทุก route ยกเว้น /lab
import { useState } from 'react';
import { Outlet, useMatch } from 'react-router-dom';

import { useAuth } from './auth/AuthContext';
import LabPage from './pages/LabPage';
import { Header } from './platform/Header';
import { usePlatformTheme } from './platform/theme';
import './platform/styles/lab.css';

// editor ของ /lab ถูก mount ครั้งแรกที่ผู้ใช้เปิด /lab แล้วค้างไว้ตลอด (ผู้ใช้ตัดสินใจหลังจุดตรวจ 1)
// ตอนอยู่ route อื่นแค่ซ่อน: งานที่รันอยู่รันต่อ การแก้ไม่หาย และ undo/redo, Log panel, clipboard ยังอยู่
// การกันผู้ที่ไม่ได้ login ยังเป็นหน้าที่ของ RequireAuth ที่ route /lab ส่วนนี้ mount เฉพาะเมื่อมี user
function LabHost() {
  const { user } = useAuth();
  const onLab = useMatch('/lab') !== null;
  const [mounted, setMounted] = useState(false);
  const [theme, toggleTheme] = usePlatformTheme();

  // ปรับ state ระหว่าง render ตามรูปแบบที่ React แนะนำ (ไม่ใช้ effect เพื่อไม่ให้กระพริบหนึ่งเฟรม)
  if (user && onLab && !mounted) setMounted(true);
  if (!user && mounted) setMounted(false);

  if (!user || !mounted) return null;

  return (
    <div
      className="viper-lab-host"
      aria-hidden={!onLab || undefined}
      inert={!onLab}
      style={onLab ? undefined : { position: 'fixed', inset: 0, visibility: 'hidden', pointerEvents: 'none' }}
    >
      {/* header ของแพลตฟอร์มบน /lab (T14): ห่อ .viper-platform เฉพาะส่วน header เพื่อไม่ให้ CSS ของ mockup รั่วเข้า editor */}
      <div className="viper-platform viper-lab-platform-header" data-theme={theme}>
        <Header theme={theme} onToggleTheme={toggleTheme} />
      </div>
      <div className="viper-lab-body">
        <LabPage active={onLab} />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Outlet />
      <LabHost />
    </>
  );
}
