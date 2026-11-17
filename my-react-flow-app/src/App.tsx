// File: src/App.tsx
// layout กลางของทุก route (T4) editor เดิมย้ายไปอยู่ที่ src/pages/LabPage.tsx (route /lab)
import { Outlet } from 'react-router-dom';

export default function App() {
  return (
    <>
      {/* ที่ว่างสำหรับ header ของแพลตฟอร์ม (T6) หน้า /lab มีหัวของ editor เองอยู่แล้ว */}
      <Outlet />
    </>
  );
}
