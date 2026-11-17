// layout ของหน้าแพลตฟอร์ม: element ราก .viper-platform + Header + <Outlet/> + footer + toast กลาง
// หน้า /lab ไม่อยู่ใต้ layout นี้ (การรวม header กับหัว Lab เป็นงาน T14)
import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { CheckCircle2, X } from 'lucide-react';

import './styles/index.css';
import { Header } from './Header';
import { usePlatformTheme } from './theme';
import { ToastContext } from './toast';

export default function Layout() {
  const [theme, toggleTheme] = usePlatformTheme();
  const [toast, setToast] = useState('');
  const notify = useCallback((message: string) => setToast(message), []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 5500);
    return () => clearTimeout(id);
  }, [toast]);

  return (
    <ToastContext.Provider value={notify}>
      <div className="viper-platform" data-theme={theme}>
        <div className="app">
          <Header theme={theme} onToggleTheme={toggleTheme} />
          <main id="main" className="main">
            <Outlet />
          </main>
          <footer className="site-footer">
            <span>
              <span className="brand-small">VIPER</span> เรียนรู้ผ่านการลงมือทำ
            </span>
            <span>Image Processing</span>
          </footer>
        </div>
        {toast && (
          <div className="toast" role="status">
            <CheckCircle2 size={18} />
            <span>{toast}</span>
            <button type="button" aria-label="ปิดข้อความ" onClick={() => setToast('')}>
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
