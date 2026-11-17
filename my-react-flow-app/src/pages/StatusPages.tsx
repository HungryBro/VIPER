// หน้าสถานะของ router (T4): route ที่ยังไม่ย้าย, path ที่ไม่มี และ error ที่หลุดถึงราก
// ทุกหน้าต้องมีเนื้อหาให้เห็น ไม่ปล่อยเป็นหน้าขาว
import type { ReactNode } from 'react';
import { Link, isRouteErrorResponse, useLocation, useRouteError } from 'react-router-dom';

import { Empty } from '../platform/ui';

function StatusShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
      <section className="w-full max-w-md rounded-2xl border border-teal-500/30 bg-slate-900 p-8 text-center shadow-2xl shadow-teal-950/40">
        <h1 className="text-xl font-black tracking-wide text-teal-300">{title}</h1>
        <div className="mt-3 text-sm leading-relaxed text-slate-400">{children}</div>
        <Link
          to="/lab"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-500 px-5 font-bold text-slate-950 transition hover:bg-teal-400"
        >
          ไปที่ Lab
        </Link>
      </section>
    </main>
  );
}

// สองหน้านี้อยู่ใต้ Layout ของแพลตฟอร์ม (.viper-platform) จึงใช้ Empty ของ platform/ui
function PlatformStatus({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="page">
      <Empty
        title={title}
        action={
          <Link to="/lab" className="btn primary">
            ไปที่ Lab
          </Link>
        }
      >
        {children}
      </Empty>
    </div>
  );
}

export function NotReadyPage() {
  const { pathname } = useLocation();
  return (
    <PlatformStatus title="หน้านี้ยังไม่พร้อม">
      หน้า <code>{pathname}</code> กำลังย้ายมาจากแบบ mockup v2 ระหว่างนี้ใช้ Lab ได้ตามปกติ
    </PlatformStatus>
  );
}

export function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <PlatformStatus title="ไม่พบหน้านี้">
      ไม่มีหน้า <code>{pathname}</code> ใน VIPER
    </PlatformStatus>
  );
}

export function RootErrorBoundary() {
  const error = useRouteError();
  let detail = 'เกิดข้อผิดพลาดที่ไม่คาดคิด';
  if (isRouteErrorResponse(error)) {
    detail = `${error.status} ${error.statusText}`;
  } else if (error instanceof Error) {
    detail = error.message;
  }
  return (
    <StatusShell title="หน้านี้แสดงไม่ได้">
      <p>{detail}</p>
    </StatusShell>
  );
}
