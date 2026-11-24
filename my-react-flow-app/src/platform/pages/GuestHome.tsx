// หน้าแรกของผู้เยี่ยมชม (ย้ายจาก GuestHome ใน mockup) ส่วนคอร์สยังว่างจนกว่าจะมีข้อมูลคอร์ส (T18/T19)
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  GraduationCap,
  Library,
  LogIn,
  ShieldCheck,
  Workflow,
} from 'lucide-react';

import { useAuth } from '../../auth/AuthContext';
import { Badge, Empty } from '../ui';
import homeDetection from '../assets/home-detection.jpg';

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
            <img src={homeDetection} alt="" />
          </div>
          <div className="guest-lab-caption">
            <span className="tiny-dot" />
            ตัวอย่างผลตรวจจับวัตถุ
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
