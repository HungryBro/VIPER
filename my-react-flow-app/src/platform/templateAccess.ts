// สิทธิ์ของ template ฝั่งหน้าจอ (T12) ใช้ซ่อน/แสดงปุ่มเท่านั้น ฝั่ง server ตรวจสิทธิ์ซ้ำทุกครั้ง (server/routers/templates.py)
//   Official: แก้/ลบ/อัปโหลดปก = admin และผู้สอน (can_teach), เปลี่ยนการมองเห็นไม่ได้
//   ทั่วไป: แก้/ลบ = เจ้าของเท่านั้น (admin ก็ลบของคนอื่นไม่ได้)
//   เปิดปิดคอมเมนต์ = admin เท่านั้น
//   Private ของคนอื่น: admin อ่าน/โหลดได้อย่างเดียว เขียนคอมเมนต์และเปิดปิดคอมเมนต์ไม่ได้ (B3, server ตอบ 403)
import type { AuthUser } from '../auth/AuthContext';
import type { TemplateSummary } from '../lib/templateApi';
import { canTeach, isAdmin } from './permissions';

type MaybeUser = AuthUser | null | undefined;

export const canManageTemplate = (user: MaybeUser, template: TemplateSummary): boolean =>
  template.is_official ? isAdmin(user) || canTeach(user) : user?.id === template.owner_id;

// ลบ: เหมือน canManageTemplate ยกเว้น Official ที่ seed ไว้ (มี official_key) ลบได้เฉพาะ admin (F16, server ตอบ 403)
export const canDeleteTemplate = (user: MaybeUser, template: TemplateSummary): boolean =>
  template.is_official && template.official_key ? isAdmin(user) : canManageTemplate(user, template);

const isSomeoneElsesPrivate =(user: MaybeUser, template: TemplateSummary): boolean =>
  !template.is_official && template.visibility === 'private' && user?.id !== template.owner_id;

// ไม่ส่ง template = ถามสิทธิ์ทั่วไปของบทบาท (ใช้กับปุ่มที่ไม่ผูกกับ template ใด)
export const canToggleComments = (user: MaybeUser, template?: TemplateSummary): boolean =>
  isAdmin(user) && !(template && isSomeoneElsesPrivate(user, template));

export const canWriteComment = (user: MaybeUser, template: TemplateSummary): boolean =>
  Boolean(user) && !isSomeoneElsesPrivate(user, template);

export type TemplateKind = 'official' | 'public' | 'private';

export const kindOf = (template: TemplateSummary): TemplateKind =>
  template.is_official ? 'official' : template.visibility;
