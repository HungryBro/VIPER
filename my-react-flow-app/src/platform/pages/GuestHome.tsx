// หน้าแรกของผู้เยี่ยมชม (ย้ายจาก GuestHome ใน mockup) ส่วนคอร์สยังว่างจนกว่าจะมีข้อมูลคอร์ส (T18/T19)
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  Image as ImageIcon,
  Library,
  LogIn,
  ScanLine,
  ShieldCheck,
  Workflow,
} from 'lucide-react';

import { useAuth } from '../../auth/AuthContext';
import { Badge, Empty, cx } from '../ui';

// ภาพประกอบคงที่ของ workflow (ไม่ใช่ข้อมูลจริง ไม่มีผลทดลอง)
const PREVIEW_NODES = [
  { category: 'Input', title: 'Sample Dataset', Icon: ImageIcon },
  { category: 'Model', title: 'Object Detector', Icon: ScanLine },
  { category: 'Evaluation', title: 'Detection Evaluation', Icon: BarChart3 },
];

function WorkflowPreview() {
  return (
    <div className="mini-workflow blue">
      <svg viewBox="0 0 330 220" className="mini-lines">
        <path d="M90 65H170Q185 65 185 80V140Q185 155 200 155H245" />
        <circle cx="185" cy="112" r="5" />
      </svg>
      {PREVIEW_NODES.map(({ category, title, Icon }, i) => (
        <div className={cx('mini-node', `node-${i}`)} key={title}>
          <span>
            <Icon size={17} />
          </span>
          <div>
            <small>{category}</small>
            <strong>{title}</strong>
          </div>
          <CheckCircle2 size={12} />
        </div>
      ))}
      <span className="mini-note">
        <span className="tiny-dot" />
        Image processing workflow
      </span>
    </div>
  );
}

export default function GuestHome() {
  const { error } = useAuth();
  return (
    <div className="page guest-home">
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <div className="page-heading">
        <div>
          <h1>VIPER - Image Processing Learning Platform</h1>
        </div>
        <Badge tone="blue">
          <GraduationCap size={14} />
          เรียนรู้ด้วย Workflow
        </Badge>
      </div>
      <section className="continue-card guest-welcome-card">
        <div className="continue-copy">
          <Badge tone="blue">ฝึกปฏิบัติ</Badge>
          <h2>
            ฝึกประมวลผลภาพ
            <br />
            ด้วย Workflow
          </h2>
          <p>
            เลือกคอร์สที่เปิดสอน ดูรายชื่อบทเรียน
            <br />
            เข้าสู่ระบบและลงทะเบียนเมื่อต้องการอ่านเนื้อหาเต็ม ใช้ Lab หรือส่งงาน
          </p>
          <div className="guest-hero-actions">
            <Link className="btn primary" to="/courses">
              <BookOpen size={16} />
              ดูคอร์ส
              <ArrowRight size={16} />
            </Link>
            <Link className="btn secondary" to="/templates">
              <Library size={16} />
              สำรวจ Template
            </Link>
          </div>
        </div>
        <div className="guest-lab-preview" aria-hidden="true">
          <div className="guest-lab-toolbar">
            <Workflow size={15} />
            <strong>VIPER Lab</strong>
            <span>Object Detection</span>
          </div>
          <div className="guest-lab-canvas">
            <WorkflowPreview />
          </div>
          <div className="guest-lab-caption">
            <span className="tiny-dot" />
            ภาพประกอบ Workflow
          </div>
        </div>
      </section>
      <section className="guest-lessons">
        <div className="section-title">
          <div>
            <h2>คอร์สที่เปิดสอน</h2>
            <p>ดูรายละเอียดและรายชื่อบทเรียนได้ ลงทะเบียนเพื่อเปิดเนื้อหาเต็ม</p>
          </div>
          <Link className="text-btn" to="/courses">
            ดูทั้งหมด
            <ArrowRight size={15} />
          </Link>
        </div>
        <Empty icon={BookOpen} title="ยังไม่มีคอร์สที่เปิดสอน">
          คอร์สที่เปิดสอนจะแสดงที่นี่
        </Empty>
      </section>
      <section className="panel guest-account-callout">
        <span className="course-icon blue">
          <ShieldCheck size={22} />
        </span>
        <div>
          <h2>เก็บความคืบหน้าและผลงานของคุณ</h2>
          <p>เข้าสู่ระบบเพื่อใช้ Lab บันทึก Template ส่งงาน และรับฟีดแบคจากผู้สอน</p>
        </div>
        <Link className="btn secondary" to="/login">
          <LogIn size={15} />
          เข้าสู่ระบบ
        </Link>
      </section>
    </div>
  );
}
