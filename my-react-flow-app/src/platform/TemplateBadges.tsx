// ป้ายการมองเห็นของ template (VisibilityBadge ของ mockup) และตัวย่อชื่อเจ้าของ
import { Globe2, LockKeyhole, ShieldCheck } from 'lucide-react';

import { Badge } from './ui';
import type { TemplateKind } from './templateAccess';

export function VisibilityBadge({ kind }: { kind: TemplateKind }) {
  return (
    <Badge tone={kind === 'official' ? 'blue' : kind === 'public' ? 'teal' : 'amber'}>
      {kind === 'official' ? <ShieldCheck size={12} /> : kind === 'public' ? <Globe2 size={12} /> : <LockKeyhole size={12} />}{' '}
      {kind === 'official' ? 'Official' : kind === 'public' ? 'Public' : 'Private'}
    </Badge>
  );
}

export function Avatar({ name }: { name: string }) {
  return <span className="mini-avatar">{name.slice(0, 2).toUpperCase()}</span>;
}
