// learningApi.ts (T18): แหล่งข้อมูลเดียวของคอร์ส บทเรียน งานที่ส่ง คะแนน ประกาศ และการแจ้งเตือน
// ทุกหน้าและ Header ต้องอ่านข้อมูลกลุ่มนี้ผ่านไฟล์นี้เท่านั้น ห้ามใส่ข้อมูลตัวอย่างจาก mockup ที่อื่น
// ตอนนี้ยังไม่มีระบบคอร์สฝั่ง server จึงคืนรายการว่าง (list) หรือ null (ค้นทีละรายการ) เสมอ
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

// รายการที่แบ่งหน้า: ตอนนี้คืนหน้าเดียวที่ว่าง (next = null)
function emptyPage<T>(query?: PageQuery): ListPage<T> {
  void query;
  return { items: [], next: null };
}

// คอร์สที่เผยแพร่แล้ว (และ archived ที่ผู้เปิดลงทะเบียนไว้) สำหรับ /courses
export async function listCourses(query?: PageQuery): Promise<ListPage<Course>> {
  return emptyPage(query);
}

// คอร์สที่ผู้เปิดจัดการได้ สำหรับ /teach (ผู้ดูแลได้ทุกคอร์ส) ไม่พบคืน []
export async function listManagedCourses(query?: PageQuery): Promise<ListPage<Course>> {
  return emptyPage(query);
}

// null = ไม่พบ หรือมองไม่เห็น (เช่น draft ของคนอื่น) เหมือน 404 ของ template
export async function getCourse(courseId: string): Promise<Course | null> {
  void courseId;
  return null;
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
