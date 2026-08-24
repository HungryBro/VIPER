import type { ReactNode } from 'react';

import { useAuth } from '../auth/AuthContext';
import LoginPage from './LoginPage';


export default function AuthGate({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-teal-300 flex items-center justify-center">
        <div className="text-sm font-bold tracking-[0.3em] animate-pulse">LOADING VIPER</div>
      </div>
    );
  }

  if (!user) return <LoginPage />;
  return children;
}
