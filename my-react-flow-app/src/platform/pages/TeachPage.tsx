// หน้า Teach (T19) ย้ายจาก TeachHome / CourseEditor ของ mockup v2 และ guard blockedTeach ของ App
// route: /teach (คอร์สที่ฉันสอน) และ /teach/:courseId ข้อมูลคอร์สมาจาก src/lib/learningApi.ts เท่านั้น
// สิทธิ์: can_teach จาก /api/auth/me หรือเป็นผู้ดูแล ไม่งั้นเห็น "ต้องได้รับสิทธิ์ผู้สอน" (server ตรวจสิทธิ์จริงเมื่อมีระบบคอร์ส)
// สร้างและแก้ข้อมูลคอร์สได้แล้ว ตัวออกแบบ Lab ยังไม่เปิดใช้ ยังไม่มีฟอร์มบทเรียน
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Eye, FileText, GraduationCap, LockKeyhole, Pencil, Plus } from 'lucide-react';

import { useAuth } from '../../auth/AuthContext';
import { createCourse, getCourse, listManagedCourses, updateCourse } from '../../lib/learningApi';
import { canTeach, isAdmin } from '../permissions';
import { errorText, useLoaded } from '../useLoaded';
import { useToast } from '../toast';
import { courseStatusBadge, type Course } from '../types';
import { Badge, Button, Empty, Modal } from '../ui';
import { CourseTabs } from './CoursesPage';

// ตอนนี้ไม่มีที่ใช้ในหน้านี้ เก็บไว้ใช้กับปุ่มของระบบที่ยังไม่มี
const COMING_LATER = 'ระบบคอร์สจะเพิ่มภายหลัง';
void COMING_LATER;
const LAB_DESIGNER_LATER = 'ตัวออกแบบ Lab จะเพิ่มรอบหน้า';

type CourseFields = { code: string; title: string; description: string };

// onSubmit ที่สำเร็จเป็นคนปิด modal ; ถ้า throw จะ toast ข้อความ และคงค่าในฟอร์มไว้
function CourseForm({
  initial,
  title,
  submitLabel,
  onSubmit,
  onClose,
}: {
  initial: CourseFields;
  title: string;
  submitLabel: string;
  onSubmit: (fields: CourseFields) => Promise<void>;
  onClose: () => void;
}) {
  const notify = useToast();
  const [fields, setFields] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof CourseFields) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields((previous) => ({ ...previous, [key]: event.target.value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await onSubmit(fields);
    } catch (failure) {
      notify(errorText(failure, 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง'));
      setBusy(false);
    }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body">
          <label className="field">
            รหัสคอร์ส
            <input
              maxLength={20}
              value={fields.code}
              onChange={set('code')}
              placeholder="เว้นว่างเพื่อให้ระบบตั้งให้ เช่น VP-7K2Q9M"
            />
          </label>
          <label className="field">
            ชื่อคอร์ส
            <input required maxLength={120} value={fields.title} onChange={set('title')} />
          </label>
          <label className="field">
            คำอธิบาย
            <textarea required maxLength={1000} rows={4} value={fields.description} onChange={set('description')} />
          </label>
          <p className="muted small">คอร์สใหม่เริ่มเป็น Draft ผู้เรียนยังไม่เห็นจนกว่าจะ Publish</p>
        </div>
        <div className="modal-actions">
          <Button kind="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" disabled={busy || !fields.title.trim() || !fields.description.trim()}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

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
  const navigate = useNavigate();
  const notify = useToast();
  const [creating, setCreating] = useState(false);
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
          <Button kind="secondary" disabled title={LAB_DESIGNER_LATER}>
            <Pencil size={15} />
            ออกแบบ Lab
          </Button>
          <Button onClick={() => setCreating(true)}>
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
            <Button onClick={() => setCreating(true)}>
              <Plus size={15} />
              สร้างคอร์สแรก
            </Button>
          }
        >
          ยังไม่มีคอร์สให้จัดการ สร้างคอร์สเป็น Draft เพิ่มบทเรียน แล้วค่อย Publish
        </Empty>
      )}
      {creating && (
        <CourseForm
          title="สร้างคอร์สใหม่"
          submitLabel="สร้างคอร์ส"
          initial={{ code: '', title: '', description: '' }}
          onClose={() => setCreating(false)}
          onSubmit={async (fields) => {
            const created = await createCourse(fields);
            notify('สร้างคอร์ส Draft แล้ว เพิ่มบทเรียนได้เลย');
            navigate(`/teach/${created.id}`);
          }}
        />
      )}
    </div>
  );
}

function CourseEditor({ courseId }: { courseId: string }) {
  const course = useLoaded(() => getCourse(courseId), 'โหลดคอร์สไม่สำเร็จ');
  const notify = useToast();
  const [editing, setEditing] = useState(false);
  // ค่าที่ server ส่งกลับหลังบันทึก ใช้แทนค่าที่โหลดตอนแรก
  const [saved, setSaved] = useState<Course | null>(null);
  if (course.loading) return <div className="page"><p className="muted small" role="status">กำลังโหลด...</p></div>;
  const found = saved ?? course.data;
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
          {course.error ?? 'ไม่พบคอร์สนี้ หรือเฉพาะเจ้าของคอร์สและผู้ดูแลเท่านั้นที่จัดการได้'}
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
          <Button kind="secondary" onClick={() => setEditing(true)}>
            <Pencil size={14} />
            แก้ข้อมูลคอร์ส
          </Button>
          <Button kind="secondary" disabled title={LAB_DESIGNER_LATER}>
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
      {editing && (
        <CourseForm
          title="แก้ข้อมูลคอร์ส"
          submitLabel="บันทึก"
          initial={{ code: found.code, title: found.title, description: found.description }}
          onClose={() => setEditing(false)}
          onSubmit={async (fields) => {
            setSaved(await updateCourse(found.id, fields));
            setEditing(false);
            notify('บันทึกข้อมูลคอร์สแล้ว');
          }}
        />
      )}
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
