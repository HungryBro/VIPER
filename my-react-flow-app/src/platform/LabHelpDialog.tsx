// วิธีใช้ Lab (C-11) ข้อความเขียนใหม่ให้ตรงกับ editor จริง (ไม่มีขั้นส่งงาน ผลมาจากการประมวลผลจริงบนเซิร์ฟเวอร์)
// /lab อยู่นอก Layout ของแพลตฟอร์ม จึงห่อด้วย .viper-platform เองเพื่อให้ Modal มีสไตล์
import { Button, Modal } from './ui';
import { usePlatformTheme } from './theme';
import './styles/index.css';

export default function LabHelpDialog({ onClose }: { onClose: () => void }) {
  const [theme] = usePlatformTheme();
  return (
    <div className="viper-platform" data-theme={theme}>
      <Modal title="เริ่มใช้ VIPER Lab" onClose={onClose}>
        <div className="modal-body">
          <p>1. ลากโหนดจากคลังทางซ้ายลงบน canvas (บนมือถือกด “+ ADD TO CANVAS” ในโหนดที่ต้องการ)</p>
          <p>2. ลากจากจุด Output ด้านขวาของโหนดไปยัง Input ด้านซ้ายของโหนดถัดไป ชนิดข้อมูลต้องตรงกัน</p>
          <p>
            3. ตั้งค่าพารามิเตอร์ในโหนดได้ทันที ลากหัวโหนดเพื่อย้าย ลากพื้นที่ว่างเพื่อเลื่อน หรือกด Fit view
            เพื่อดูทั้งหมด
          </p>
          <p>
            4. กด Start เพื่อรันทั้ง workflow ผลลัพธ์จะแสดงในโหนดและ Log panel เป็นผลจากการประมวลผลภาพจริงบนเซิร์ฟเวอร์
          </p>
          <p>
            คลิกสายหรือโหนดแล้วกด Delete เพื่อลบ งานในแต่ละแท็บจะบันทึกในเบราว์เซอร์นี้อัตโนมัติ
            ถ้าต้องการเก็บไว้ในแพลตฟอร์มหรือแชร์ ให้กด SAVE TEMPLATE
          </p>
        </div>
        <div className="modal-actions">
          <Button onClick={onClose}>เข้าใจแล้ว</Button>
        </div>
      </Modal>
    </div>
  );
}
