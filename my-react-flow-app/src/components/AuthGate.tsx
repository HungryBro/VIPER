import type { ReactNode } from 'react';

import { useAuth } from '../auth/AuthContext';


// รอผลตรวจ session ครั้งแรกเท่านั้น (ไม่ให้เป็นหน้าขาว) ไม่ได้กันหน้าใดอีกแล้ว:
// หน้าแรก "/" เปิดได้โดยไม่ login ส่วน route อื่นกันด้วย RequireAuth (src/platform/RequireAuth.tsx)
export default function AuthGate({ children }: { children: ReactNode }) {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-teal-300 flex items-center justify-center">
        <div className="text-sm font-bold tracking-[0.3em] animate-pulse">LOADING VIPER</div>
      </div>
    );
  }

  return children;
}
