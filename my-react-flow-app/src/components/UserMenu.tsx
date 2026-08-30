import { useState } from 'react';

import { useAuth } from '../auth/AuthContext';
import AdminUserPanel from './AdminUserPanel';


export default function UserMenu() {
  const { user, logout } = useAuth();
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  if (!user) return null;

  return (
    <div className="viper-user-menu flex shrink-0 items-center gap-1.5 sm:gap-2">
      {user.avatar_url ? (
        <img
          src={user.avatar_url}
          alt=""
          referrerPolicy="no-referrer"
          className="h-8 w-8 rounded-full border border-teal-500/50"
        />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/20 text-xs font-black text-teal-300">
          {user.display_name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="hidden text-right xl:block">
        <div className="max-w-36 truncate text-xs font-semibold text-slate-200">{user.display_name}</div>
        <div className="text-[9px] font-bold uppercase tracking-wider text-teal-400">{user.role}</div>
      </div>
      {user.role === 'admin' && (
        <button
          type="button"
          onClick={() => setAdminPanelOpen(true)}
          title="User Management"
          aria-label="Open User Management Menu"
          className="flex h-9 w-9 touch-manipulation items-center justify-center rounded-md border border-teal-500/40 bg-teal-500/10 text-base font-bold leading-none text-teal-300 hover:bg-teal-500/20"
        >
          ☰
        </button>
      )}
      <button
        type="button"
        onClick={() => void logout()}
        aria-label="Log out"
        className="flex h-9 touch-manipulation items-center justify-center rounded-md border border-slate-700 bg-slate-800 px-2 text-[10px] font-bold text-slate-300 hover:border-red-500/50 hover:text-red-300"
      >
        <span className="viper-user-logout-label hidden sm:inline">LOG OUT</span>
        <svg aria-hidden="true" className="viper-user-logout-icon h-4 w-4 sm:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M21 19V5a2 2 0 0 0-2-2h-6" /></svg>
      </button>
      {user.role === 'admin' && (
        <AdminUserPanel
          open={adminPanelOpen}
          currentUserId={user.id}
          onClose={() => setAdminPanelOpen(false)}
        />
      )}
    </div>
  );
}
