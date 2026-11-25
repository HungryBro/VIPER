// learningApi.ts (T18): แหล่งข้อมูลเดียวของคอร์ส บทเรียน งานที่ส่ง คะแนน ประกาศ และการแจ้งเตือน
// ทุกหน้าและ Header ต้องอ่านข้อมูลกลุ่มนี้ผ่านไฟล์นี้เท่านั้น ห้ามใส่ข้อมูลตัวอย่างจาก mockup ที่อื่น
// คอร์สเรียก server จริงแล้ว ส่วนที่เหลือ (บทเรียน งานที่ส่ง ฯลฯ) ยังคืนรายการว่าง (list) หรือ null (ค้นทีละรายการ)
// ระบบคอร์สรอบหน้าให้เปลี่ยนเฉพาะ "ตัวฟังก์ชัน" เป็นการเรียก apiFetch ไป /api/... โดยคง signature และ type เดิม
// (เพิ่มได้แต่ field แบบ optional ห้ามเปลี่ยนหรือลบ field ที่มีอยู่) หน้าจอจึงไม่ต้องแก้
// ความล้มเหลวของ server ให้ throw Error ที่มีข้อความภาษาไทย เหมือน meApi.ts / templateApi.ts
// รายการทุกชนิด (ยกเว้นบทเรียนของคอร์สเดียว) คืน ListPage { items, next } และรับ PageQuery เพื่อแบ่งหน้า
// ค้นทีละรายการ: null = ไม่พบหรือมองไม่เห็น (เหมือนนโยบาย 404 ของ template) ; ไม่มีสิทธิ์อ่านเนื้อหาแต่เห็นว่ามีอยู่ = locked
import type {
  Announcement,
  Course,
  GradeRow,
  LearningScope,
  Lesson,
  LessonLookup,
  ListPage,
  PageQuery,
  PlatformNotification,
  Review,
  Submission,
} from '../platform/types';
import { apiFetch } from './http';

// รูปแบบคอร์สที่ server ส่งมา (CoursePublic ใน server/schemas.py)
type RawCourse = {
  id: number;
  owner_id: number;
  owner_name: string;
  code: string;
  title: string;
  description: string;
  status: Course['status'];
  created_at: string;
  updated_at: string;
  lesson_count: number;
  enrolled_count: number;
  enrolled: boolean;
  can_manage: boolean;
};

type CourseFields = { code?: string; title: string; description: string };

function toCourse(raw: RawCourse): Course {
  return {
    id: String(raw.id),
    ownerId: String(raw.owner_id),
    ownerName: raw.owner_name,
    code: raw.code,
    title: raw.title,
    description: raw.description,
    status: raw.status,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    lessonCount: raw.lesson_count,
    enrolledCount: raw.enrolled_count,
    enrolled: raw.enrolled,
    canManage: raw.can_manage,
  };
}

const COURSE_ERRORS: Record<number, string> = {
  403: 'ไม่มีสิทธิ์จัดการคอร์สนี้',
  404: 'ไม่พบคอร์สหรือบทเรียน',
  409: 'รหัสคอร์สนี้ถูกใช้แล้ว',
  422: 'ข้อมูลคอร์สไม่ถูกต้อง',
};
const COURSE_ERROR_OTHER = 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง';

// เครือข่ายล้ม (fetch reject) ต้องได้ข้อความไทยเหมือนกัน
async function courseFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await apiFetch(path, init);
  } catch {
    throw new Error(COURSE_ERROR_OTHER);
  }
}

async function readCourseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(COURSE_ERRORS[response.status] ?? COURSE_ERROR_OTHER);
  return (await response.json()) as T;
}

async function coursePage(path: string, query?: PageQuery): Promise<ListPage<Course>> {
  const search = query?.limit ? `?limit=${query.limit}` : '';
  const page = await readCourseJson<ListPage<RawCourse>>(await courseFetch(`${path}${search}`));
  return { items: page.items.map(toCourse), next: page.next };
}

async function sendCourse(path: string, method: 'POST' | 'PATCH', fields: Partial<CourseFields>): Promise<Course> {
  const response = await courseFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  return toCourse(await readCourseJson<RawCourse>(response));
}

// รายการที่แบ่งหน้า: ตอนนี้คืนหน้าเดียวที่ว่าง (next = null)
function emptyPage<T>(query?: PageQuery): ListPage<T> {
  void query;
  return { items: [], next: null };
}

// คอร์สที่เผยแพร่แล้ว (และ archived ที่ผู้เปิดลงทะเบียนไว้) สำหรับ /courses
export async function listCourses(query?: PageQuery): Promise<ListPage<Course>> {
  return coursePage('/api/courses', query);
}

// คอร์สที่ผู้เปิดจัดการได้ สำหรับ /teach (ผู้ดูแลได้ทุกคอร์ส) ไม่พบคืน []
export async function listManagedCourses(query?: PageQuery): Promise<ListPage<Course>> {
  return coursePage('/api/courses/managed', query);
}

// null = ไม่พบ หรือมองไม่เห็น (เช่น draft ของคนอื่น) เหมือน 404 ของ template
export async function getCourse(courseId: string): Promise<Course | null> {
  const response = await courseFetch(`/api/courses/${encodeURIComponent(courseId)}`);
  if (response.status === 404) return null;
  return toCourse(await readCourseJson<RawCourse>(response));
}

// สร้างเป็น Draft เสมอ ; code ว่าง = ให้ server ตั้งให้
export async function createCourse(fields: CourseFields): Promise<Course> {
  return sendCourse('/api/courses', 'POST', fields);
}

export async function updateCourse(courseId: string, fields: Partial<CourseFields>): Promise<Course> {
  return sendCourse(`/api/courses/${encodeURIComponent(courseId)}`, 'PATCH', fields);
}

// บทเรียนของคอร์ส เรียงตาม position
export async function listLessons(courseId: string): Promise<Lesson[]> {
  void courseId;
  return [];
}

// null = ไม่พบ ; { locked: true } = มีอยู่แต่ผู้เปิดยังไม่ได้ลงทะเบียน (เห็นแค่ชื่อและคำโปรย)
export async function getLesson(lessonId: string): Promise<LessonLookup | null> {
  void lessonId;
  return null;
}

// งานที่ส่ง เรียงล่าสุดก่อน: mine = ของตัวเอง, teaching = ของผู้เรียนในคอร์สที่ตัวเองสอน
export async function listSubmissions(scope: LearningScope, query?: PageQuery): Promise<ListPage<Submission>> {
  void scope;
  return emptyPage(query);
}

// ผลตรวจของงานที่ส่ง (ใช้คู่กับ listSubmissions)
export async function listReviews(scope: LearningScope, query?: PageQuery): Promise<ListPage<Review>> {
  void scope;
  return emptyPage(query);
}

// สมุดคะแนน: mine = แถวของตัวเอง, teaching = ผู้เรียนทุกคนในคอร์สที่สอน
export async function listGrades(scope: LearningScope, query?: PageQuery): Promise<ListPage<GradeRow>> {
  void scope;
  return emptyPage(query);
}

// ประกาศที่ผู้เปิดเห็นได้ (คอร์สที่ลงทะเบียนหรือสอน) เรียงล่าสุดก่อน
export async function listAnnouncements(query?: PageQuery): Promise<ListPage<Announcement>> {
  return emptyPage(query);
}

// การแจ้งเตือนของผู้เปิดเอง เรียงล่าสุดก่อน (Header ใช้กับกระดิ่ง)
export async function listNotifications(query?: PageQuery): Promise<ListPage<PlatformNotification>> {
  return emptyPage(query);
}
