// learningApi.ts (T18): แหล่งข้อมูลเดียวของคอร์ส บทเรียน งานที่ส่ง คะแนน ประกาศ และการแจ้งเตือน
// ทุกหน้าและ Header ต้องอ่านข้อมูลกลุ่มนี้ผ่านไฟล์นี้เท่านั้น ห้ามใส่ข้อมูลตัวอย่างจาก mockup ที่อื่น
// ตอนนี้ยังไม่มีระบบคอร์สฝั่ง server จึงคืนรายการว่าง (list) หรือ null (ค้นทีละรายการ) เสมอ
// ระบบคอร์สรอบหน้าให้เปลี่ยนเฉพาะ "ตัวฟังก์ชัน" เป็นการเรียก apiFetch ไป /api/... โดยคง signature และ type เดิม
// (เพิ่มได้แต่ field แบบ optional ห้ามเปลี่ยนหรือลบ field ที่มีอยู่) หน้าจอจึงไม่ต้องแก้
// ความล้มเหลวของ server ให้ throw Error ที่มีข้อความภาษาไทย เหมือน meApi.ts / templateApi.ts
import type {
  Announcement,
  Course,
  GradeRow,
  LearningScope,
  Lesson,
  PlatformNotification,
  Review,
  Submission,
} from '../platform/types';

// คอร์สที่เผยแพร่แล้ว (และ archived ที่ผู้เปิดลงทะเบียนไว้) สำหรับ /courses
export async function listCourses(): Promise<Course[]> {
  return [];
}

// คอร์สที่ผู้เปิดจัดการได้ สำหรับ /teach (ผู้ดูแลได้ทุกคอร์ส) ไม่พบคืน []
export async function listManagedCourses(): Promise<Course[]> {
  return [];
}

export async function getCourse(courseId: string): Promise<Course | null> {
  void courseId;
  return null;
}

// บทเรียนของคอร์ส เรียงตาม position
export async function listLessons(courseId: string): Promise<Lesson[]> {
  void courseId;
  return [];
}

export async function getLesson(lessonId: string): Promise<Lesson | null> {
  void lessonId;
  return null;
}

// งานที่ส่ง เรียงล่าสุดก่อน: mine = ของตัวเอง, teaching = ของผู้เรียนในคอร์สที่ตัวเองสอน
export async function listSubmissions(scope: LearningScope): Promise<Submission[]> {
  void scope;
  return [];
}

// ผลตรวจของงานที่ส่ง (ใช้คู่กับ listSubmissions)
export async function listReviews(scope: LearningScope): Promise<Review[]> {
  void scope;
  return [];
}

// สมุดคะแนน: mine = แถวของตัวเอง, teaching = ผู้เรียนทุกคนในคอร์สที่สอน
export async function listGrades(scope: LearningScope): Promise<GradeRow[]> {
  void scope;
  return [];
}

// ประกาศที่ผู้เปิดเห็นได้ (คอร์สที่ลงทะเบียนหรือสอน) เรียงล่าสุดก่อน
export async function listAnnouncements(): Promise<Announcement[]> {
  return [];
}

// การแจ้งเตือนของผู้เปิดเอง เรียงล่าสุดก่อน (Header ใช้กับกระดิ่ง)
export async function listNotifications(): Promise<PlatformNotification[]> {
  return [];
}
