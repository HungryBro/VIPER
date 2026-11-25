// ส่วน "ภาพปก" ของ dialog บันทึก Template: เลือก/ลากวาง ตรวจไฟล์ฝั่งหน้าเว็บ และดูตัวอย่างแบบเดียวกับการ์ด (16:9, cover)
// ชนิดและขนาดไฟล์ตรงกับที่ server รับ (server/routers/templates.py) ขนาดเป็นพิกเซลเป็นแค่คำแนะนำ
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ImagePlus } from 'lucide-react';

import { COVER_TYPES, MAX_COVER_BYTES } from '../lib/templateApi';
import { Button } from './ui';

export type PickedCover = { file: File; url: string; width: number; height: number };

const SIZE_HINT = 'แนะนำ 1280 × 720 px (16:9) · ขั้นต่ำ 640 × 360 px · JPG PNG WEBP · ไม่เกิน 5 MB';

const readSize = (url: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('unreadable'));
    image.src = url;
  });

/** คำเตือนที่ยังใช้ภาพได้ (ภาพเล็ก หรือสัดส่วนต่างจาก 16:9 เกิน 5%) */
function coverWarnings({ width, height }: PickedCover): string[] {
  const warnings: string[] = [];
  if (width < 640 || height < 360) warnings.push('ภาพอาจไม่คมบนการ์ด');
  if (Math.abs(width / height / (16 / 9) - 1) > 0.05) warnings.push('ภาพจะถูกตัดขอบตามตัวอย่าง');
  return warnings;
}

/** สถานะภาพปกอยู่ที่ dialog เพื่อให้ยังอยู่ระหว่างบันทึก object URL ถูกคืนเมื่อเปลี่ยนภาพ ลบ หรือปิด dialog */
// eslint-disable-next-line react-refresh/only-export-components
export function useCoverPick() {
  const [picked, setPicked] = useState<PickedCover | null>(null);
  const [problem, setProblem] = useState('');
  const latest = useRef(0);

  useEffect(() => {
    if (!picked) return;
    return () => URL.revokeObjectURL(picked.url);
  }, [picked]);
  // ภาพที่ยังอ่านขนาดไม่เสร็จตอนปิด dialog ต้องไม่ถูกเก็บ
  useEffect(() => () => { latest.current = -1; }, []);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    // ไฟล์ที่ไม่ผ่านไม่ถูกเก็บ ภาพที่เลือกไว้ก่อนหน้า (ถ้ามี) ยังอยู่
    if (!COVER_TYPES.split(',').includes(file.type)) {
      setProblem('ใช้ได้เฉพาะไฟล์ JPG PNG หรือ WEBP');
      return;
    }
    if (file.size > MAX_COVER_BYTES) {
      setProblem('ไฟล์ใหญ่กว่า 5 MB');
      return;
    }
    const ticket = ++latest.current;
    const url = URL.createObjectURL(file);
    try {
      const size = await readSize(url);
      if (ticket !== latest.current) {
        URL.revokeObjectURL(url);
        return;
      }
      setProblem('');
      setPicked({ file, url, ...size });
    } catch {
      URL.revokeObjectURL(url);
      if (ticket === latest.current) setProblem('อ่านไฟล์ภาพไม่ได้');
    }
  };

  const clear = () => {
    latest.current += 1;
    setPicked(null);
    setProblem('');
  };

  return { picked, problem, pick, clear };
}

export default function SaveTemplateCover({ picked, problem, pick, clear }: ReturnType<typeof useCoverPick>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLButtonElement>(null);
  const changeRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const hadPick = useRef(Boolean(picked));

  // ปุ่มที่กดอยู่หายไปเมื่อสลับระหว่างกล่องว่างกับตัวอย่าง: ย้าย focus ไปปุ่มที่มาแทน
  useEffect(() => {
    if (hadPick.current === Boolean(picked)) return;
    hadPick.current = Boolean(picked);
    if (picked) changeRef.current?.querySelector('button')?.focus();
    else zoneRef.current?.focus();
  }, [picked]);

  const openPicker = () => inputRef.current?.click();
  const warnings = picked ? coverWarnings(picked) : [];

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void pick(event.dataTransfer.files[0]);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={COVER_TYPES}
        hidden
        aria-label="ไฟล์ภาพปก"
        onChange={(event) => {
          void pick(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {picked ? (
        <div className={`save-template-picked${dragging ? ' save-template-dragging' : ''}`}>
          <figure className="save-template-preview">
            <img src={picked.url} alt="ตัวอย่างภาพปก" />
            <figcaption>ตัวอย่างบนการ์ด</figcaption>
          </figure>
          <div className="save-template-fileinfo">
            <strong>{picked.file.name}</strong>
            <span className="muted small">
              {picked.width} × {picked.height} px · {(picked.file.size / (1024 * 1024)).toFixed(1)} MB
            </span>
            <div role="status">
              {warnings.length === 0 ? (
                <p className="save-template-check save-template-ok">
                  <CheckCircle2 size={14} aria-hidden="true" /> ขนาดพอดี
                </p>
              ) : (
                warnings.map((warning) => (
                  <p key={warning} className="save-template-check save-template-warn">
                    <AlertTriangle size={14} aria-hidden="true" /> {warning}
                  </p>
                ))
              )}
            </div>
            <div className="save-template-fileactions" ref={changeRef}>
              <Button kind="secondary" onClick={openPicker}>
                เปลี่ยนภาพ
              </Button>
              <Button kind="secondary" onClick={clear}>
                ลบ
              </Button>
            </div>
            <span className="muted small">แนะนำ 1280 × 720 px · ไม่เกิน 5 MB</span>
          </div>
        </div>
      ) : (
        <>
          <button
            ref={zoneRef}
            type="button"
            className={`save-template-dropzone${dragging ? ' save-template-dragging' : ''}`}
            onClick={openPicker}
          >
            <ImagePlus size={26} aria-hidden="true" />
            <strong>
              ลากภาพมาวาง หรือ <span>เลือกไฟล์</span>
            </strong>
            <small>{SIZE_HINT}</small>
          </button>
          <p className="save-template-hint muted small">ถ้าไม่ใส่ การ์ดจะแสดงแบบเดิม</p>
        </>
      )}
      {problem && (
        <p className="save-template-check save-template-bad" role="alert">
          <AlertTriangle size={14} aria-hidden="true" /> {problem}
        </p>
      )}
    </div>
  );
}
