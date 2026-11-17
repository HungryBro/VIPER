// header ของผู้เยี่ยมชม (ย้ายจาก GuestHeader ใน mockup) ลิงก์ที่ไม่ใช่หน้าแรกพาไป Login พร้อม next
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { LogIn, Moon, Sun, UserRound } from 'lucide-react';

import { loginPathFor } from './safeNext';
import type { PlatformTheme } from './theme';
import { cx } from './ui';

const GUEST_NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/courses', label: 'Courses' },
  { to: '/templates', label: 'Templates' },
  { to: '/lab', label: 'Lab' },
] as const;

export function GuestHeader({ theme, onToggleTheme }: { theme: PlatformTheme; onToggleTheme: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  return (
    <>
      <a href="#main" className="skip-link">
        ข้ามไปเนื้อหา
      </a>
      <header className="global-header platform-header guest-header">
        <Link className="brand" to="/" aria-label="VIPER หน้าหลัก">
          <span className="header-wordmark">VIPER</span>
          <span className="header-brand-caption">
            <strong>Image Processing</strong>
            <small>Learning Platform</small>
          </span>
        </Link>
        <nav className="global-nav" aria-label="เมนูหลัก">
          {GUEST_NAV.map((item) =>
            item.to === '/' ? (
              <NavLink key={item.label} to={item.to} end className={({ isActive }) => cx(isActive && 'active')}>
                {item.label}
              </NavLink>
            ) : (
              <Link key={item.label} to={loginPathFor(item.to)}>
                {item.label}
              </Link>
            ),
          )}
        </nav>
        <div className="header-tools">
          <button
            type="button"
            className="icon-btn theme-btn"
            aria-label={theme === 'dark' ? 'ใช้ธีมสว่าง' : 'ใช้ธีมมืด'}
            onClick={onToggleTheme}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <Link className="btn primary guest-login-button" to="/login">
            Sign in
          </Link>
          <div ref={menu} className="account-anchor">
            <button
              type="button"
              className="avatar guest-avatar"
              aria-label="เมนูโปรไฟล์"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <UserRound size={18} />
            </button>
            {menuOpen && (
              <div className="account-menu guest-account-menu">
                <strong>ยินดีต้อนรับสู่ VIPER</strong>
                <small>คุณยังไม่ได้เข้าสู่ระบบ</small>
                <Link to={loginPathFor('/profile')} onClick={() => setMenuOpen(false)}>
                  <UserRound size={16} />
                  โปรไฟล์
                </Link>
                <Link to="/login" onClick={() => setMenuOpen(false)}>
                  <LogIn size={16} />
                  เข้าสู่ระบบ
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
