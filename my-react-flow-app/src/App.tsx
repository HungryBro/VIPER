// File: src/App.tsx
// route ราก (T4) editor เดิมย้ายไปอยู่ที่ src/pages/LabPage.tsx (route /lab)
// header/footer/ธีมของแพลตฟอร์มอยู่ใน src/platform/Layout.tsx (T6) ซึ่งครอบทุก route ยกเว้น /lab
import { Outlet } from 'react-router-dom';

export default function App() {
  return (
    <>
      <Outlet />
    </>
  );
}
