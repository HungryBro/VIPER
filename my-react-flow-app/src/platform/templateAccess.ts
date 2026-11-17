// สิทธิ์ของ template ฝั่งหน้าจอ (T12) ใช้ซ่อน/แสดงปุ่มเท่านั้น ฝั่ง server ตรวจสิทธิ์ซ้ำทุกครั้ง (server/routers/templates.py)
//   Official: แก้/ลบ/อัปโหลดปก = admin และผู้สอน (can_teach), เปลี่ยนการมองเห็นไม่ได้
//   ทั่วไป: แก้/ลบ = เจ้าของเท่านั้น (admin ก็ลบของคนอื่นไม่ได้)
//   เปิดปิดคอมเมนต์ = admin เท่านั้น
import type { AuthUser } from '../auth/AuthContext';
import type { TemplateSummary } from '../lib/templateApi';
import { canTeach, isAdmin } from './permissions';

type MaybeUser = AuthUser | null | undefined;

export const canManageTemplate = (user: MaybeUser, template: TemplateSummary): boolean =>
  template.is_official ? isAdmin(user) || canTeach(user) : user?.id === template.owner_id;

export const canToggleComments = (user: MaybeUser): boolean => isAdmin(user);

export type TemplateKind = 'official' | 'public' | 'private';

export const kindOf = (template: TemplateSummary): TemplateKind =>
  template.is_official ? 'official' : template.visibility;
