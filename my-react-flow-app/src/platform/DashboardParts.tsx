// ส่วนที่ Dashboard 3 แบบใช้ร่วมกัน (T17): Stat ของ mockup
import type { ComponentType, ReactNode } from 'react';

export function Stat({
  label,
  value,
  icon: Icon,
  note,
}: {
  label: string;
  value: ReactNode;
  icon: ComponentType<{ size?: number }>;
  note?: string;
}) {
  return (
    <div className="panel overview-stat">
      <span>
        <Icon size={19} />
        {label}
      </span>
      <strong>{value}</strong>
      {note && <small className="muted">{note}</small>}
    </div>
  );
}
