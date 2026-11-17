// สิทธิ์ฝั่งหน้าจอ อ่านจาก useAuth() ที่เดียว (can_teach มาจาก /api/auth/me ตั้งแต่ T8)
import type { AuthUser } from '../auth/AuthContext';

type MaybeUser = AuthUser | null | undefined;

export const isAdmin = (user: MaybeUser): boolean => user?.role === 'admin';

// จุดเดียวที่อ่าน can_teach (ฝั่ง server ตรวจสิทธิ์ซ้ำทุกครั้ง ค่านี้ใช้แค่ซ่อน/แสดงเมนู)
export const canTeach = (user: MaybeUser): boolean => user?.can_teach === true;

export type RoleKey = 'learner' | 'instructor' | 'admin';

export const roleKey = (user: MaybeUser): RoleKey => (isAdmin(user) ? 'admin' : canTeach(user) ? 'instructor' : 'learner');

const ROLE_LABELS: Record<RoleKey, string> = { learner: 'ผู้เรียน', instructor: 'ผู้สอน', admin: 'ผู้ดูแล' };
export const roleLabel = (user: MaybeUser): string => ROLE_LABELS[roleKey(user)];

export type NavItem = {
  to: string;
  label: string;
  // path ที่ถือว่าเมนูนี้ยัง active (เช่น หน้าบทเรียนอยู่ใต้ Courses)
  activePrefixes?: string[];
  end?: boolean;
};

// เมนูหลักของผู้ที่ login แล้ว ลำดับและข้อความตาม PlatformHeader ของ mockup
export function navItemsFor(user: MaybeUser): NavItem[] {
  const admin = isAdmin(user);
  const teacher = canTeach(user);
  const items: NavItem[] = [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/courses', label: 'Courses', activePrefixes: ['/lessons', '/teach'] },
  ];
  if (teacher) items.push({ to: '/submissions', label: 'Submissions' });
  items.push({ to: '/templates', label: 'Templates' });
  if (admin) items.push({ to: '/users', label: 'Users' });
  // ตาม mockup: My Submissions แสดงเมื่อ !admin && (!teacher || learnsSomething) (ผู้ใช้ยืนยันหลังจุดตรวจ 1 ให้ซ่อนของ admin)
  // ของจริงยังไม่มีการลงทะเบียนเรียน (learnsSomething = false) จนกว่าจะมีระบบคอร์ส ผู้สอนจึงไม่เห็นเมนูนี้
  const learnsSomething = false;
  if (!admin && (!teacher || learnsSomething)) items.push({ to: '/submissions', label: 'My Submissions' });
  if (admin) items.push({ to: '/logs', label: 'Platform Logs' });
  items.push({ to: '/lab', label: 'Lab' });
  return items;
}
