// File: src/App.tsx
// route ราก (T4) editor เดิมย้ายไปอยู่ที่ src/pages/LabPage.tsx (route /lab)
// header/footer/ธีมของแพลตฟอร์มอยู่ใน src/platform/Layout.tsx (T6) ซึ่งครอบทุก route ยกเว้น /lab
import { useEffect, useRef, useState } from 'react';
import { Outlet, useMatch } from 'react-router-dom';

import { useAuth } from './auth/AuthContext';
import LabPage from './pages/LabPage';
import { Header } from './platform/Header';
import { labBridge } from './platform/labBridge';
import { usePlatformTheme } from './platform/theme';
import './platform/styles/lab.css';

// ส่วนของ COMPACT_MOBILE_QUERY ใน LabPage ที่เป็นโทรศัพท์แนวนอน (ไม่รวมจอแคบแนวตั้ง ซึ่ง header ยังแสดงตามเดิม)
const SHORT_SCREEN_QUERY = '(max-height: 560px) and (pointer: coarse)';

// editor ของ /lab ถูก mount ครั้งแรกที่ผู้ใช้เปิด /lab แล้วค้างไว้ตลอด (ผู้ใช้ตัดสินใจหลังจุดตรวจ 1)
// ตอนอยู่ route อื่นแค่ซ่อน: งานที่รันอยู่รันต่อ การแก้ไม่หาย และ undo/redo, Log panel, clipboard ยังอยู่
// การกันผู้ที่ไม่ได้ login ยังเป็นหน้าที่ของ RequireAuth ที่ route /lab ส่วนนี้ mount เฉพาะเมื่อมี user
function LabHost() {
  const { user } = useAuth();
  const onLab = useMatch('/lab') !== null;
  const [mounted, setMounted] = useState(false);
  const [theme, toggleTheme] = usePlatformTheme();
  // B7b: โทรศัพท์แนวนอน (จอเตี้ย + pointer coarse) ซ่อน header แพลตฟอร์มเพื่อให้ editor มีที่ เปิดดูได้จากปุ่มเมนูบนหัวของ Lab
  const [shortScreen, setShortScreen] = useState(() => window.matchMedia(SHORT_SCREEN_QUERY).matches);
  const [platformHeaderOpen, setPlatformHeaderOpen] = useState(false);
  useEffect(() => {
    const mediaQuery = window.matchMedia(SHORT_SCREEN_QUERY);
    const sync = () => setShortScreen(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener('change', sync);
    return () => mediaQuery.removeEventListener('change', sync);
  }, []);
  const headerCollapsed = shortScreen && !platformHeaderOpen;

  // logout หรือเปลี่ยนบัญชี: ล้าง template ที่ค้างใน labBridge (A4d)
  const userId = user?.id ?? null;
  const lastUserIdRef = useRef(userId);
  useEffect(() => {
    if (lastUserIdRef.current === userId) return;
    lastUserIdRef.current = userId;
    labBridge.clear();
  }, [userId]);

  // ปรับ state ระหว่าง render ตามรูปแบบที่ React แนะนำ (ไม่ใช้ effect เพื่อไม่ให้กระพริบหนึ่งเฟรม)
  if (user && onLab && !mounted) setMounted(true);
  if (!user && mounted) setMounted(false);

  if (!user || !mounted) return null;

  return (
    <div
      className={['viper-lab-host', headerCollapsed && 'lab-header-collapsed', !onLab && 'viper-lab-host--hidden'].filter(Boolean).join(' ')}
      aria-hidden={!onLab || undefined}
      inert={!onLab}
      style={onLab ? undefined : { position: 'fixed', inset: 0, visibility: 'hidden', pointerEvents: 'none' }}
    >
      {/* header ของแพลตฟอร์มบน /lab (T14): ห่อ .viper-platform เฉพาะส่วน header เพื่อไม่ให้ CSS ของ mockup รั่วเข้า editor */}
      <div className="viper-platform viper-lab-platform-header" data-theme={theme}>
        <Header theme={theme} onToggleTheme={toggleTheme} />
      </div>
      <div className="viper-lab-body">
        <LabPage
          active={onLab}
          platformMenu={shortScreen ? { open: platformHeaderOpen, toggle: () => setPlatformHeaderOpen((open) => !open) } : undefined}
        />
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
