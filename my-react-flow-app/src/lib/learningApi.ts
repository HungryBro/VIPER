// learningApi.ts (T18): แหล่งข้อมูลเดียวของคอร์ส บทเรียน งานที่ส่ง คะแนน ประกาศ และการแจ้งเตือน
// ทุกหน้าและ Header ต้องอ่านข้อมูลกลุ่มนี้ผ่านไฟล์นี้เท่านั้น ห้ามใส่ข้อมูลตัวอย่างจาก mockup ที่อื่น
// คอร์สและบทเรียนเรียก server จริงแล้ว ส่วนที่เหลือ (งานที่ส่ง คะแนน ฯลฯ) ยังคืนรายการว่าง (list) หรือ null (ค้นทีละรายการ)
// ระบบคอร์สรอบหน้าให้เปลี่ยนเฉพาะ "ตัวฟังก์ชัน" เป็นการเรียก apiFetch ไป /api/... โดยคง signature และ type เดิม
// (เพิ่มได้แต่ field แบบ optional ห้ามเปลี่ยนหรือลบ field ที่มีอยู่) หน้าจอจึงไม่ต้องแก้
// ความล้มเหลวของ server ให้ throw Error ที่มีข้อความภาษาไทย เหมือน meApi.ts / templateApi.ts
// รายการทุกชนิด (ยกเว้นบทเรียนของคอร์สเดียว) คืน ListPage { items, next } และรับ PageQuery เพื่อแบ่งหน้า
// ค้นทีละรายการ: null = ไม่พบหรือมองไม่เห็น (เหมือนนโยบาย 404 ของ template) ; ไม่มีสิทธิ์อ่านเนื้อหาแต่เห็นว่ามีอยู่ = locked
import type {
  Announcement,
  Course,
  CourseEnrollment,
  CourseStatus,
  GradeRow,
  LearningScope,
  Lesson,
  LessonLookup,
  LessonPreview,
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
  publish_blockers: string[] | null;
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
    ...(raw.publish_blockers ? { publishBlockers: raw.publish_blockers } : {}),
  };
}

const COURSE_ERRORS: Record<number, string> = {
  403: 'ไม่มีสิทธิ์จัดการคอร์สนี้',
  404: 'ไม่พบคอร์สหรือบทเรียน',
  409: 'รหัสคอร์สนี้ถูกใช้แล้ว',
  422: 'ข้อมูลคอร์สไม่ถูกต้อง',
};
const COURSE_ERROR_OTHER = 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง';
const LESSON_ERRORS: Record<number, string> = { ...COURSE_ERRORS, 422: 'ข้อมูลบทเรียนไม่ถูกต้อง' };

// เครือข่ายล้ม (fetch reject) ต้องได้ข้อความไทยเหมือนกัน
async function courseFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await apiFetch(path, init);
  } catch {
    throw new Error(COURSE_ERROR_OTHER);
  }
}

function checkResponse(response: Response, errors: Record<number, string>): void {
  if (!response.ok) throw new Error(errors[response.status] ?? COURSE_ERROR_OTHER);
}

async function readCourseJson<T>(response: Response, errors = COURSE_ERRORS): Promise<T> {
  checkResponse(response, errors);
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

// รูปแบบบทเรียนที่ server ส่งมา (LessonPublic / LessonLookupPublic ใน server/schemas.py)
type RawLessonPreview = { id: number; course_id: number; title: string; subtitle: string };
type RawLesson = RawLessonPreview & {
  position: number;
  content_md: string;
  minutes: number;
  level: Lesson['level'];
  color: Lesson['color'];
  activity: Lesson['activity'];
};
type RawLessonLookup = { locked: false; lesson: RawLesson } | { locked: true; lesson: RawLessonPreview };

type LessonFields = Partial<Pick<Lesson, 'title' | 'subtitle' | 'contentMd' | 'minutes' | 'level'>>;

function toLessonPreview(raw: RawLessonPreview): LessonPreview {
  return { id: String(raw.id), courseId: String(raw.course_id), title: raw.title, subtitle: raw.subtitle };
}

function toLesson(raw: RawLesson): Lesson {
  return {
    ...toLessonPreview(raw),
    position: raw.position,
    contentMd: raw.content_md,
    minutes: raw.minutes,
    level: raw.level,
    color: raw.color,
    activity: raw.activity,
  };
}

function toLessonLookup(raw: RawLessonLookup): LessonLookup {
  return raw.locked
    ? { locked: true, lesson: toLessonPreview(raw.lesson) }
    : { locked: false, lesson: toLesson(raw.lesson) };
}

const lessonPath = (lessonId: string) => `/api/lessons/${encodeURIComponent(lessonId)}`;

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

export async function setCourseStatus(courseId: string, status: CourseStatus): Promise<Course> {
  const response = await courseFetch(`/api/courses/${encodeURIComponent(courseId)}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  // 409 ของ endpoint นี้ไม่ใช่รหัสซ้ำ: อ่านเหตุจาก body ก่อนใช้ตารางข้อความ
  if (response.status === 409) {
    const body = await response.clone().json().catch(() => null);
    if (body?.detail?.code === 'publish_blocked') {
      throw new Error(`Publish ไม่ได้: ${body.detail.blockers.join(' · ')}`);
    }
    throw new Error(COURSE_ERROR_OTHER);
  }
  return toCourse(await readCourseJson<RawCourse>(response));
}

// 409 ของการลงทะเบียนบอกเหตุเป็น code ใน body ไม่ใช่รหัสคอร์สซ้ำ
const ENROLL_CONFLICTS: Record<string, string> = {
  manager_cannot_enroll: 'ผู้สอนของคอร์สลงทะเบียนเรียนไม่ได้',
  course_closed: 'คอร์สนี้ปิดรับลงทะเบียนแล้ว',
};

async function postEnrollment(courseId: string, action: 'enroll' | 'unenroll'): Promise<Response> {
  const response = await courseFetch(`/api/courses/${encodeURIComponent(courseId)}/${action}`, { method: 'POST' });
  if (response.status === 409) {
    const body = await response.clone().json().catch(() => null);
    throw new Error(ENROLL_CONFLICTS[body?.detail?.code] ?? COURSE_ERROR_OTHER);
  }
  return response;
}

export async function enrollCourse(courseId: string): Promise<Course> {
  return toCourse(await readCourseJson<RawCourse>(await postEnrollment(courseId, 'enroll')));
}

// null = ยกเลิกแล้วมองไม่เห็นคอร์สอีก (draft หรือ archived: server ตอบ 204)
export async function unenrollCourse(courseId: string): Promise<Course | null> {
  const response = await postEnrollment(courseId, 'unenroll');
  if (response.status === 204) return null;
  return toCourse(await readCourseJson<RawCourse>(response));
}

type RawEnrollment = { user_id: number; name: string; email: string; enrolled_at: string };

export async function listEnrollments(courseId: string): Promise<CourseEnrollment[]> {
  const response = await courseFetch(`/api/courses/${encodeURIComponent(courseId)}/enrollments`);
  return (await readCourseJson<RawEnrollment[]>(response)).map((raw) => ({
    userId: String(raw.user_id),
    name: raw.name,
    email: raw.email,
    enrolledAt: raw.enrolled_at,
  }));
}

// เหตุที่ลบไม่ได้ (409) หรือยังขาดเหตุผล (422) มาเป็น code ใน body
const DELETE_REFUSALS: Record<string, string> = {
  delete_not_draft: 'ลบได้เฉพาะคอร์สที่เป็น Draft',
  delete_has_learners: 'คอร์สนี้มีผู้ลงทะเบียนแล้ว ลบไม่ได้',
  reason_required: 'กรุณาระบุเหตุผลการลบ',
};

export async function deleteCourse(courseId: string, reason?: string): Promise<void> {
  const response = await courseFetch(`/api/courses/${encodeURIComponent(courseId)}`, {
    method: 'DELETE',
    ...(reason ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) } : {}),
  });
  if (response.status === 409 || response.status === 422) {
    const body = await response.clone().json().catch(() => null);
    const message = DELETE_REFUSALS[body?.detail?.code];
    if (message) throw new Error(message);
    // 409 ที่ไม่รู้จักต้องไม่กลายเป็นข้อความ "รหัสซ้ำ"
    if (response.status === 409) throw new Error(COURSE_ERROR_OTHER);
  }
  checkResponse(response, COURSE_ERRORS);
}

// บทเรียนของคอร์ส เรียงตาม position
export async function listLessons(courseId: string): Promise<Lesson[]> {
  const response = await courseFetch(`/api/courses/${encodeURIComponent(courseId)}/lessons`);
  if (response.status === 404) return [];
  return (await readCourseJson<RawLesson[]>(response, LESSON_ERRORS)).map(toLesson);
}

// null = ไม่พบ ; { locked: true } = มีอยู่แต่ผู้เปิดยังไม่ได้ลงทะเบียน (เห็นแค่ชื่อและคำโปรย)
export async function getLesson(lessonId: string): Promise<LessonLookup | null> {
  const response = await courseFetch(lessonPath(lessonId));
  if (response.status === 404) return null;
  return toLessonLookup(await readCourseJson<RawLessonLookup>(response, LESSON_ERRORS));
}

// ต่อท้ายคอร์ส server ตั้งชื่อ "บทเรียนที่ N" ให้
export async function createLesson(courseId: string): Promise<Lesson> {
  const response = await courseFetch(`/api/courses/${encodeURIComponent(courseId)}/lessons`, { method: 'POST' });
  return toLesson(await readCourseJson<RawLesson>(response, LESSON_ERRORS));
}

export async function updateLesson(lessonId: string, fields: LessonFields): Promise<Lesson> {
  const { contentMd, ...rest } = fields;
  const response = await courseFetch(lessonPath(lessonId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...rest, content_md: contentMd }),
  });
  return toLesson(await readCourseJson<RawLesson>(response, LESSON_ERRORS));
}

export async function deleteLesson(lessonId: string): Promise<void> {
  checkResponse(await courseFetch(lessonPath(lessonId), { method: 'DELETE' }), LESSON_ERRORS);
}

// คืนบทเรียนทั้งคอร์สตามลำดับใหม่ (ย้ายที่ขอบ = ลำดับเดิม)
export async function moveLesson(lessonId: string, direction: -1 | 1): Promise<Lesson[]> {
  const response = await courseFetch(`${lessonPath(lessonId)}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction }),
  });
  return (await readCourseJson<RawLesson[]>(response, LESSON_ERRORS)).map(toLesson);
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
