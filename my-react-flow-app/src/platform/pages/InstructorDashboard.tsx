// Dashboard ผู้สอน (can_teach) T17 ย้ายจาก InstructorDashboard ของ mockup v2
// จำนวนและรายการคอร์สมาจาก learningApi (listManagedCourses) ส่วนการส่งงานยังไม่มีระบบ "งานที่รอตรวจ" จึงเป็น 0
// Template ของฉันมาจาก /api/me/summary
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, CheckCheck, FileText, Library } from 'lucide-react';

import { listManagedCourses } from '../../lib/learningApi';
import { getMySummary } from '../../lib/meApi';
import { Stat } from '../DashboardParts';
import { courseStatusBadge } from '../types';
import { num, useLoaded } from '../useLoaded';
import { Badge, Button, Empty } from '../ui';

const SHOWN_COURSES = 5;

export default function InstructorDashboard() {
  const navigate = useNavigate();
  const summary = useLoaded(getMySummary, 'โหลดสรุปไม่สำเร็จ');
  const courses = useLoaded(listManagedCourses, 'โหลดคอร์สที่สอนไม่สำเร็จ');
  const latest = [...(courses.data?.items ?? [])]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, SHOWN_COURSES);

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Instructor Dashboard</h1>
          <p>จัดการคอร์ส ตรวจงานที่ส่ง และให้ฟีดแบคแก่ผู้เรียนของคุณ</p>
        </div>
        <Button onClick={() => navigate('/templates')}>
          <Library size={17} />
          จัดการ Template
          <ArrowRight size={16} />
        </Button>
      </div>
      <div className="overview-stats">
        <Stat label="คอร์สของคุณ" value={num(courses.data?.items.length)} icon={BookOpen} />
        {/* รอระบบส่งงาน: ช่องนี้เป็น 0 คงที่ ไม่ได้มาจาก API */}
        <Stat label="งานที่รอตรวจ" value={0} icon={FileText} />
        <Stat label="Template ของฉัน" value={num(summary.data?.template_count)} icon={CheckCheck} />
      </div>
      {summary.error && (
        <p className="muted small" role="alert">
          {summary.error}
        </p>
      )}
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>คอร์สของคุณ</h2>
            <p>คลิกจัดการเพื่อแก้บทเรียนและออกแบบ Lab</p>
          </div>
          {latest.length > 0 && (
            <Link className="text-btn" to="/teach">
              ดูทั้งหมด
              <ArrowRight size={15} />
            </Link>
          )}
        </div>
        {courses.loading && <p className="muted small" role="status">กำลังโหลด…</p>}
        {courses.error && (
          <p className="muted small" role="alert">
            {courses.error}
          </p>
        )}
        {latest.map((course) => {
          const [label, tone] = courseStatusBadge(course.status);
          return (
            <div className="management-row" key={course.id}>
              <div className="course-icon blue">
                <BookOpen size={20} />
              </div>
              <div>
                <h3>
                  {course.title} <small className="muted">{course.code}</small>
                </h3>
                <p>
                  {course.lessonCount} บทเรียน · {course.enrolledCount} ผู้ลงทะเบียน
                </p>
              </div>
              <Badge tone={tone}>{label}</Badge>
              <Link className="btn secondary" to={`/teach/${course.id}`}>
                จัดการ
              </Link>
            </div>
          );
        })}
        {courses.data && !latest.length && (
          <Empty
            icon={BookOpen}
            title="ยังไม่มีคอร์ส"
            action={
              <Link className="btn primary" to="/teach">
                ไปหน้าสอน
              </Link>
            }
          >
            ยังไม่มีคอร์ส สร้างคอร์สแรกได้ที่หน้าสอน
          </Empty>
        )}
      </section>
    </div>
  );
}
