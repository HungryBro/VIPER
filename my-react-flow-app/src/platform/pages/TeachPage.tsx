// หน้า Teach (T19) ย้ายจาก TeachHome / CourseEditor ของ mockup v2 และ guard blockedTeach ของ App
// route: /teach (คอร์สที่ฉันสอน) และ /teach/:courseId ข้อมูลคอร์สมาจาก src/lib/learningApi.ts เท่านั้น
// สิทธิ์: can_teach จาก /api/auth/me หรือเป็นผู้ดูแล ไม่งั้นเห็น "ต้องได้รับสิทธิ์ผู้สอน" (server ตรวจสิทธิ์จริงเมื่อมีระบบคอร์ส)
// ปุ่มสร้างคอร์สและตัวออกแบบ Lab ไม่เปิดใช้ (ว่างตามแผน) ไม่มีฟอร์มสร้าง/แก้คอร์สหรือบทเรียนในรอบนี้
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Eye, FileText, GraduationCap, LockKeyhole, Pencil, Plus } from 'lucide-react';

import { useAuth } from '../../auth/AuthContext';
import { getCourse, listManagedCourses } from '../../lib/learningApi';
import { canTeach, isAdmin } from '../permissions';
import { useLoaded } from '../useLoaded';
import { courseStatusBadge } from '../types';
import { Badge, Button, Empty } from '../ui';
import { CourseTabs } from './CoursesPage';

const COMING_LATER = 'ระบบคอร์สจะเพิ่มภายหลัง';

// จุดเดียวของ guard: ไม่มีสิทธิ์ผู้สอนแล้วไม่ render เนื้อหา (กันไม่ให้ยิง learningApi ของฝั่งผู้สอนโดยไม่จำเป็น)
function TeachGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!canTeach(user) && !isAdmin(user)) {
    return (
      <div className="page">
        <Empty
          icon={LockKeyhole}
          title="ต้องได้รับสิทธิ์ผู้สอน"
          action={
            <Link className="btn primary" to="/">
              กลับหน้าหลัก
            </Link>
          }
        >
          ผู้ดูแลต้องเปิดสิทธิ์ผู้สอนให้บัญชีนี้ก่อน จึงจะสร้างคอร์สและตรวจงานได้
        </Empty>
      </div>
    );
  }
  return <>{children}</>;
}

function TeachHome() {
  const { user } = useAuth();
  const { data, error, loading } = useLoaded(listManagedCourses, 'โหลดคอร์สที่สอนไม่สำเร็จ');
  // แสดงหน้าแรกของรายการ (data.next ใช้ต่อเมื่อมีระบบคอร์ส)
  const courses = data?.items ?? [];
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>คอร์สที่ฉันสอน</h1>
          <p>{isAdmin(user) ? 'คอร์สทั้งหมดในระบบ' : 'จัดการคอร์สของคุณ ออกแบบบทเรียนและ Lab แล้วเผยแพร่ให้ผู้เรียน'}</p>
        </div>
        <div className="course-heading-actions">
          <Link className="btn secondary" to="/submissions">
            <FileText size={15} />
            Submissions
          </Link>
          <Button kind="secondary" disabled title={COMING_LATER}>
            <Pencil size={15} />
            ออกแบบ Lab
          </Button>
          <Button disabled title={COMING_LATER}>
            <Plus size={15} />
            สร้างคอร์ส
          </Button>
        </div>
      </div>
      <CourseTabs active="teach" />
      {error && <div className="validation-message" role="alert">{error}</div>}
      {loading && <p className="muted small" role="status">กำลังโหลด...</p>}
      {courses.length > 0 && (
        <section className="panel">
          {courses.map((course) => {
            const [label, tone] = courseStatusBadge(course.status);
            return (
              <div className="management-row teach-course-row" key={course.id}>
                <div className="course-icon blue">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h3>
                    {course.title} <small className="muted">{course.code}</small>
                  </h3>
                  <p>
                    {course.lessonCount} บทเรียน · {course.enrolledCount} ผู้ลงทะเบียน
                    {isAdmin(user) && ` · ผู้สอน ${course.ownerName}`}
                  </p>
                </div>
                <Badge tone={tone}>{label}</Badge>
                <Link className="btn secondary" to={`/teach/${course.id}`}>
                  <Pencil size={14} />
                  จัดการ
                </Link>
              </div>
            );
          })}
        </section>
      )}
      {!loading && !error && !courses.length && (
        <Empty
          icon={GraduationCap}
          title="ยังไม่มีคอร์ส"
          action={
            <Button disabled title={COMING_LATER}>
              <Plus size={15} />
              สร้างคอร์สแรก
            </Button>
          }
        >
          ยังไม่มีคอร์สให้จัดการ {COMING_LATER} เมื่อพร้อมจะสร้างคอร์สเป็น Draft เพิ่มบทเรียนและ Lab แล้วค่อย Publish ได้
        </Empty>
      )}
    </div>
  );
}

function CourseEditor({ courseId }: { courseId: string }) {
  const course = useLoaded(() => getCourse(courseId), 'โหลดคอร์สไม่สำเร็จ');
  if (course.loading) return <div className="page"><p className="muted small" role="status">กำลังโหลด...</p></div>;
  const found = course.data;
  if (!found || !found.canManage) {
    return (
      <div className="page">
        <Empty
          icon={LockKeyhole}
          title="จัดการคอร์สนี้ไม่ได้"
          action={
            <Link className="btn primary" to="/teach">
              กลับหน้าสอน
            </Link>
          }
        >
          {course.error ?? `ไม่พบคอร์สนี้ หรือเฉพาะเจ้าของคอร์สและผู้ดูแลเท่านั้นที่จัดการได้ (${COMING_LATER})`}
        </Empty>
      </div>
    );
  }
  const [label, tone] = courseStatusBadge(found.status);
  return (
    <div className="page">
      <Link className="back-link" to="/teach">
        <ArrowLeft size={15} />
        คอร์สที่ฉันสอน
      </Link>
      <div className="page-heading">
        <div>
          <h1>
            {found.title} <Badge tone={tone}>{label}</Badge>
          </h1>
          <p>{found.description}</p>
        </div>
        <div className="course-heading-actions">
          <Button kind="secondary" disabled title={COMING_LATER}>
            <Pencil size={14} />
            แก้ข้อมูลคอร์ส
          </Button>
          <Button kind="secondary" disabled title={COMING_LATER}>
            <Pencil size={14} />
            ออกแบบ Lab
          </Button>
          <Link className="btn secondary" to={`/courses/${found.id}`}>
            <Eye size={14} />
            ดูหน้าคอร์ส
          </Link>
        </div>
      </div>
      <section className="panel course-status-panel">
        <div className="section-title">
          <div>
            <h2>สถานะคอร์ส</h2>
            <p>{found.enrolledCount} ผู้ลงทะเบียน</p>
          </div>
        </div>
      </section>
    </div>
  );
}

// /teach
export default function TeachPage() {
  return (
    <TeachGuard>
      <TeachHome />
    </TeachGuard>
  );
}

// /teach/:courseId
export function TeachCourseRoute() {
  const { courseId = '' } = useParams();
  return (
    <TeachGuard>
      <CourseEditor key={courseId} courseId={courseId} />
    </TeachGuard>
  );
}
