import { useState } from 'react';

import { useAuth } from '../auth/AuthContext';
import AdminUserPanel from './AdminUserPanel';


export default function UserMenu() {
  const { user, logout } = useAuth();
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  if (!user) return null;

  return (
    <div className="absolute right-3 flex items-center gap-2">
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
      <div className="hidden text-right sm:block">
        <div className="max-w-36 truncate text-xs font-semibold text-slate-200">{user.display_name}</div>
        <div className="text-[9px] font-bold uppercase tracking-wider text-teal-400">{user.role}</div>
      </div>
      {user.role === 'admin' && (
        <button
          type="button"
          onClick={() => setAdminPanelOpen(true)}
          className="rounded-md border border-teal-500/40 bg-teal-500/10 px-2 py-1 text-[10px] font-bold text-teal-300 hover:bg-teal-500/20"
        >
          ADMIN
        </button>
      )}
      <button
        type="button"
        onClick={() => void logout()}
        className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-300 hover:border-red-500/50 hover:text-red-300"
      >
        LOG OUT
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
