// header ของแพลตฟอร์ม (ย้ายจาก PlatformHeader ใน mockup) เมนูตามสิทธิ์จริงจาก useAuth()
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Bell, LogOut, Moon, Sun, UserRound, Users, X } from 'lucide-react';

import { useAuth } from '../auth/AuthContext';
import AdminUserPanel from '../components/AdminUserPanel';
import { isAdmin, navItemsFor, roleLabel } from './permissions';
import type { PlatformTheme } from './theme';
import { Badge, Empty, cx } from './ui';

export function Header({ theme, onToggleTheme }: { theme: PlatformTheme; onToggleTheme: () => void }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const popup = useRef<HTMLDivElement>(null);
  const accountPopup = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popup.current?.contains(target)) setNotificationsOpen(false);
      if (!accountPopup.current?.contains(target)) setAccountOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotificationsOpen(false);
        setAccountOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  if (!user) return null;
  const nav = navItemsFor(user);
  // ยังไม่มีระบบแจ้งเตือน (T20) แสดงสถานะว่างเสมอ ไม่มีตัวเลขค้าง
  const unread = 0;
  const initials = user.display_name.slice(0, 2).toUpperCase();

  return (
    <>
      <a href="#main" className="skip-link">
        ข้ามไปเนื้อหา
      </a>
      <header className="global-header platform-header">
        <Link className="brand" to="/" aria-label="VIPER หน้าหลัก">
          <span className="header-wordmark">VIPER</span>
          <span className="header-brand-caption">
            <strong>Image Processing</strong>
            <small>Learning Platform</small>
          </span>
        </Link>
        <nav className="global-nav" aria-label="เมนูหลัก">
          {nav.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx((isActive || item.activePrefixes?.some((prefix) => pathname.startsWith(prefix))) && 'active')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="header-tools">
          <button
            type="button"
            className="icon-btn theme-btn"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'ใช้ธีมสว่าง' : 'ใช้ธีมมืด'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="notification-anchor" ref={popup}>
            <button
              type="button"
              className={cx('icon-btn notification-bell', notificationsOpen && 'active')}
              aria-label={`การแจ้งเตือน ${unread} รายการยังไม่อ่าน`}
              aria-expanded={notificationsOpen}
              onClick={() => {
                setNotificationsOpen(!notificationsOpen);
                setAccountOpen(false);
              }}
            >
              <Bell size={19} />
            </button>
            {notificationsOpen && (
              <section className="notification-popup" aria-label="รายการแจ้งเตือน">
                <header>
                  <h2>การแจ้งเตือน</h2>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setNotificationsOpen(false)}
                    aria-label="ปิดการแจ้งเตือน"
                  >
                    <X size={17} />
                  </button>
                </header>
                <div className="notification-toolbar">
                  <button type="button" className={unreadOnly ? '' : 'active'} onClick={() => setUnreadOnly(false)}>
                    ทั้งหมด
                  </button>
                  <button
                    type="button"
                    className={unreadOnly ? 'active' : ''}
                    onClick={() => setUnreadOnly(true)}
                    aria-label={`ยังไม่อ่าน ${unread} รายการ`}
                  >
                    ยังไม่อ่าน
                  </button>
                  <button type="button" className="text-btn" disabled>
                    อ่านทั้งหมด
                  </button>
                </div>
                <div className="notification-list">
                  <Empty icon={Bell} title="ไม่มีการแจ้งเตือน">
                    รายการใหม่จะปรากฏเมื่อมีฟีดแบค ความคิดเห็น หรือการจัดการที่เกี่ยวข้อง
                  </Empty>
                </div>
              </section>
            )}
          </div>
          <div className="account-anchor" ref={accountPopup}>
            <button
              type="button"
              className={cx('avatar', pathname === '/profile' && 'selected')}
              aria-label="เมนูบัญชี"
              aria-expanded={accountOpen}
              onClick={() => {
                setAccountOpen(!accountOpen);
                setNotificationsOpen(false);
              }}
            >
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt=""
                  referrerPolicy="no-referrer"
                  style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                initials
              )}
            </button>
            {accountOpen && (
              <div className="account-menu">
                <strong>{user.display_name}</strong>
                <small>{user.email}</small>
                <Badge tone="blue">{roleLabel(user)}</Badge>
                <Link to="/profile" onClick={() => setAccountOpen(false)}>
                  <UserRound size={16} />
                  โปรไฟล์และผลงาน
                </Link>
                {isAdmin(user) && (
                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      setAdminPanelOpen(true);
                    }}
                  >
                    <Users size={16} />
                    จัดการผู้ใช้ (แผงเดิม)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setAccountOpen(false);
                    // ออกจากระบบแล้วกลับหน้าแรก (ไม่ให้ RequireAuth พาไป /login?next=หน้าเดิม)
                    // ถ้า POST /api/auth/logout ล้ม AuthContext ล้าง user แล้ว ก็ยังกลับหน้าแรกเหมือนกัน
                    void logout()
                      .catch(() => undefined)
                      .then(() => navigate('/', { replace: true }));
                  }}
                >
                  <LogOut size={16} />
                  ออกจากระบบ
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      {isAdmin(user) && (
        <AdminUserPanel open={adminPanelOpen} currentUserId={user.id} onClose={() => setAdminPanelOpen(false)} />
      )}
    </>
  );
}
