// หน้า Login ตามแบบ mockup (P-30) เหลือปุ่ม Google ปุ่มเดียวที่เรียก login() จริง
// ก่อนไปหน้า Google เก็บ next (ที่ผ่าน safeNext แล้ว) ไว้ใน sessionStorage เพราะ backend redirect กลับ "/" เสมอ
import { BookOpen, CheckCircle2, ChevronRight, GraduationCap, ShieldCheck, Workflow } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import '../platform/styles/index.css';
import { rememberNext, safeNext } from '../platform/safeNext';
import { readStoredTheme } from '../platform/theme';
import { Badge, Button } from '../platform/ui';


export default function LoginPage() {
  const { user, error, login } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));

  // login แล้วไม่ต้องอยู่หน้านี้
  if (user) return <Navigate to={next} replace />;

  return (
    <div className="viper-platform" data-theme={readStoredTheme()}>
      <div className="app">
        <main id="main" className="main">
          <div className="login-page">
            <section className="login-story">
              <div className="brand">
                <span className="brand-mark">
                  <Workflow size={24} />
                </span>
                <span>
                  VIPER<small>IMAGE PROCESSING</small>
                </span>
              </div>
              <Badge tone="blue">ฝึกปฏิบัติ</Badge>
              <h1>
                ฝึกประมวลผลภาพ
                <br />
                ด้วย Workflow
              </h1>
              <p>
                สร้าง Workflow แล้วดูผลการทดลองในคอร์ส Image Processing
                <br />
                รองรับผู้เรียน ผู้สอน และผู้ดูแล
              </p>
              <div className="login-flow" aria-hidden="true">
                <span>
                  <BookOpen />
                  เรียนรู้
                </span>
                <ChevronRight />
                <span>
                  <Workflow />
                  ทดลอง
                </span>
                <ChevronRight />
                <span>
                  <CheckCircle2 />
                  เข้าใจ
                </span>
              </div>
              <div className="login-roles">
                <span>
                  <GraduationCap size={17} />
                  ผู้เรียน
                </span>
                <span>
                  <BookOpen size={17} />
                  ผู้สอน
                </span>
                <span>
                  <ShieldCheck size={17} />
                  ผู้ดูแล
                </span>
              </div>
            </section>
            <section className="login-card">
              <Link className="back-link login-back" to="/">
                <ChevronRight size={14} className="back-chevron" />
                กลับหน้าหลัก
              </Link>
              <h2>เข้าสู่ระบบ VIPER</h2>
              <p>เข้าสู่ระบบด้วยบัญชี Google เพื่อใช้ Lab บันทึก Template และส่งงาน</p>
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              <Button
                className="google-login full"
                onClick={() => {
                  rememberNext(next);
                  login();
                }}
              >
                <span className="google-g">G</span>
                ดำเนินการต่อด้วย Google
              </Button>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
