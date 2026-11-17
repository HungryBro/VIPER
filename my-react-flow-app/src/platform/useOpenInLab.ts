// "เปิดใน Lab" (T13): POST /api/templates/{id}/load ครั้งเดียวต่อการกด (เกิด log template.load)
// แล้วส่ง detail ให้ LabPage ผ่าน labBridge และไปที่ /lab
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { loadPlatformTemplate, type TemplateSummary } from '../lib/templateApi';
import { labBridge } from './labBridge';
import { useToast } from './toast';

export function useOpenInLab(): { openInLab: (template: TemplateSummary) => Promise<void>; openingId: number | null } {
  const navigate = useNavigate();
  const notify = useToast();
  const [openingId, setOpeningId] = useState<number | null>(null);
  const busy = useRef(false);

  const openInLab = useCallback(
    async (template: TemplateSummary) => {
      if (busy.current) return;
      busy.current = true;
      setOpeningId(template.id);
      try {
        labBridge.push(await loadPlatformTemplate(template.id));
        navigate('/lab');
      } catch (err) {
        notify(err instanceof Error ? err.message : 'เปิด Template ใน Lab ไม่สำเร็จ');
      } finally {
        busy.current = false;
        setOpeningId(null);
      }
    },
    [navigate, notify],
  );

  return { openInLab, openingId };
}
