// src/lib/templateInfo.ts
// Bilingual write-ups shown by the "About Algorithm" dialog, keyed by the
// Official template's name. The workflows themselves live in the database
// (seeded from server/official_templates.json).

export type TemplateInfo = {
  name: string;
  description: string;
  descriptor?: { en: string; th: string };
  longDescription?: { en: string; th: string };
  color: string;
  // false for templates of node groups that are switched off (NODE_GROUPS in nodeCatalog.ts)
  enabled: boolean;
};

export const TEMPLATE_INFO: TemplateInfo[] = [
  {
    "name": "SIFT (Scale-Invariant Feature Transform)",
    "description": "IMAGE + SIFT",
    "descriptor": {
      "en": "Extracts robust keypoints and descriptors invariant to image scale and rotation.",
      "th": "อัลกอริทึมค้นหาจุดเด่น (Keypoints) ที่ทนทานต่อการย่อขยายและการหมุนของภาพ"
    },
    "longDescription": {
      "en": "SIFT is a powerful algorithm for detecting local features in an image. It identifies \"keypoints\" that remain stable even when the image is resized, rotated, or has changed illumination. It works by constructing image pyramids to find features at multiple scales.\n    \nSimilar algorithms in this category include SURF (faster version) and ORB (efficient alternative for real-time apps).",
      "th": "SIFT เป็นอัลกอริทึมทรงพลังในการระบุ \"จุดสนใจ\" ภายในภาพ จุดเด่นที่หาได้จะมีคุณสมบัติพิเศษคือไม่เปลี่ยนแปลงแม้ภาพจะถูกย่อขยาย (Scale) หรือหมุน (Rotation) โดยเริ่มจากการสร้าง Image Pyramids เพื่อหาจุดเด่นในทุกขนาด\n    \nในกลุ่มนี้ยังมีอัลกอริทึมอื่นๆ เช่น SURF และ ORB ที่ทำงานด้วยหลักการคล้ายกันแต่มีความเร็วและวิธีการคำนวณต่างกัน"
    },
    "color": "green",
    "enabled": true
  },
  {
    "name": "FLANN (Fast Library for Approximate Nearest Neighbors)",
    "description": "IMAGE + SIFT + FLANN",
    "descriptor": {
      "en": "A high-speed matcher optimized for large datasets using approximate nearest neighbor search.",
      "th": "ตัวจับคู่จุดเด่นที่เน้นความเร็วสูง โดยใช้การค้นหาแบบประมาณค่า (Approximate)"
    },
    "longDescription": {
      "en": "Once features are extracted, FLANN helps match them between images efficiently. Unlike Brute-Force matchers that check every possibility, FLANN uses optimized data structures (like KD-Trees) to find the \"nearest\" matches much faster.\n    \nIt provides an approximate result, trading a tiny bit of accuracy for significant speed, making it ideal for large image databases.",
      "th": "เมื่อสกัดจุดเด่นได้แล้ว FLANN จะช่วยจับคู่จุดเหล่านั้นระหว่างภาพได้อย่างรวดเร็ว ต่างจากการจับคู่แบบ Brute-Force ที่ตรวจสอบทุกความเป็นไปได้ โดย FLANN ใช้โครงสร้างข้อมูลพิเศษ (เช่น KD-Tree) เพื่อค้นหาคู่ที่ \"ใกล้เคียงที่สุด\"\n    \nเหมาะสำหรับงานที่มีชุดข้อมูลขนาดใหญ่หรือต้องการความเร็วสูง โดยแลกมาด้วยความแม่นยำที่ลดลงเพียงเล็กน้อยจากการประมาณค่า"
    },
    "color": "orange",
    "enabled": true
  },
  {
    "name": "PSNR (Peak Signal-to-Noise Ratio)",
    "description": "IMAGE + PSNR",
    "descriptor": {
      "en": "Measures image quality by comparing pixel differences against a reference image.",
      "th": "การวัดคุณภาพภาพโดยเปรียบเทียบสัญญาณต่อสัญญาณรบกวน โดยใช้ภาพต้นฉบับอ้างอิง"
    },
    "longDescription": {
      "en": "PSNR is an engineering standard for measuring the reconstruction quality of an image (e.g., after compression). It calculates the error between the original image and the processed one. Higher values indicate better quality.\n    \nThis works similarly to SSIM (Structural Similarity), but PSNR focuses purely on pixel-level error rather than structural perception.",
      "th": "PSNR คือมาตรวัดมาตรฐานที่ใช้ประเมินคุณภาพของภาพ (เช่น หลังการบีบอัด) โดยเปรียบเทียบหาค่าความผิดพลาดกับภาพต้นฉบับ (Reference Image) ยิ่งค่า PSNR สูง แสดงว่าคุณภาพภาพดี\n    \nหลักการทำงานคล้ายกับ SSIM แต่ PSNR จะเน้นคำนวณความต่างของเม็ดพิกเซลโดยตรงมากกว่าโครงสร้างภาพ"
    },
    "color": "blue",
    "enabled": true
  },
  {
    "name": "BRISQUE (Blind/Referenceless Image Spatial Quality Evaluator)",
    "description": "IMAGE + BRISQUE",
    "descriptor": {
      "en": "Evaluates image quality without a reference image using Natural Scene Statistics.",
      "th": "การวัดคุณภาพภาพแบบ \"ไม่ต้องใช้ภาพต้นฉบับ\" โดยวิเคราะห์จากสถิติของภาพธรรมชาติ"
    },
    "longDescription": {
      "en": "Unlike PSNR, BRISQUE does not need an original image to compare against. It evaluates quality based on \"Natural Scene Statistics,\" analyzing deviations in pixel distribution.\n    \nIt can detect distortions like blur or noise by checking if the image statistics match those typically found in high-quality natural images.",
      "th": "ต่างจาก PSNR ตรงที่ BRISQUE ไม่ต้องใช้ภาพต้นฉบับมาเปรียบเทียบ แต่จะประเมินคุณภาพโดยใช้องค์ความรู้เรื่อง \"สถิติของภาพธรรมชาติ\" (Natural Scene Statistics)\n    \n    อัลกอริทึมจะตรวจสอบความผิดปกติของการกระจายตัวของแสง หากภาพมีความเบลอหรือ Noise สถิติเหล่านี้จะเพี้ยนไป ทำให้สามารถให้คะแนนคุณภาพได้ทันที"
    },
    "color": "blue",
    "enabled": true
  },
  {
    "name": "Otsu Thresholding",
    "description": "IMAGE + OTSU",
    "descriptor": {
      "en": "Automatically calculates the optimal threshold value to separate foreground from background.",
      "th": "การแยกวัตถุออกจากพื้นหลังแบบอัตโนมัติ โดยหาค่าความเข้มแสงที่เหมาะสมที่สุด"
    },
    "longDescription": {
      "en": "Otsu's method is a global thresholding technique used for binarization. It analyzes the image histogram to find a threshold value that minimizes the intra-class variance between black and white pixels.\n    \nIt is the most standard way to segment objects without manually guessing the threshold value.",
      "th": "Otsu เป็นเทคนิคพื้นฐานในการทำภาพขาว-ดำ (Binarization) โดยไม่ต้องกำหนดค่าเอง อัลกอริทึมจะวิเคราะห์ฮิสโตแกรมของภาพ และคำนวณหาจุดตัดที่ทำให้ความแปรปรวนของพิกเซลสีดำและขาวน้อยที่สุด\n    \nวิธีนี้เป็นมาตรฐานในการแยกวัตถุออกจากพื้นหลังที่มีความต่างของแสงชัดเจน"
    },
    "color": "pink",
    "enabled": true
  },
  {
    "name": "Active Contour (Snake)",
    "description": "IMAGE + SNAKE",
    "descriptor": {
      "en": "An iterative algorithm that fits a contour to object boundaries using energy minimization.",
      "th": "การหาขอบเขตวัตถุโดยใช้เส้นโค้งที่ค่อยๆ บีบรัดเข้าหาวัตถุด้วยการลดค่าพลังงาน"
    },
    "longDescription": {
      "en": "A \"Snake\" is a synthesized curve that moves and adapts within an image to lock onto object edges. It works by minimizing \"energy\"—balancing internal forces (smoothness) and external forces (image edges).\n    \nThis is useful for segmenting objects with irregular shapes where simple thresholding might fail.",
      "th": "Snake คือเส้นโค้งสังเคราะห์ที่จะค่อยๆ เคลื่อนตัวรัดเข้าหาขอบของวัตถุโดยอัตโนมัติ หลักการคือการลดค่า \"พลังงาน\" โดยอาศัยแรงภายใน (รักษาความโค้งมน) และแรงภายนอก (ดึงเข้าหาขอบภาพ)\n    \nเหมาะสำหรับการหาขอบเขตของวัตถุที่มีรูปร่างซับซ้อน ซึ่งการทำ Threshold ธรรมดาอาจทำไม่ได้"
    },
    "color": "pink",
    "enabled": true
  },
  {
    "name": "Homography Estimation",
    "description": "IMAGE + SIFT + FLANN + HOMOGRAPHY",
    "descriptor": {
      "en": "Calculates a transformation matrix to map points from one perspective to another.",
      "th": "การคำนวณเมทริกซ์เพื่อแปลงมุมมองภาพ (Perspective) ให้ทับซ้อนกันได้อย่างถูกต้อง"
    },
    "longDescription": {
      "en": "Homography computes a 3x3 matrix that relates two images of the same planar surface in space. It is used to \"warp\" the source image to align perfectly with the target image, correcting perspective distortions.\n    \n    This is essential for image stitching (panoramas) and perspective correction, offering more capabilities than standard Affine transformations.",
      "th": "Homography คือการหาความสัมพันธ์ทางเรขาคณิตระหว่างภาพสองภาพ ผลลัพธ์คือเมทริกซ์ขนาด 3x3 ที่ใช้ \"บิด\" (Warp) ภาพต้นฉบับให้เปลี่ยนมุมมองไปตรงกับภาพเป้าหมายได้\n    \n    เทคนิคนี้จำเป็นมากในการต่อภาพพาโนรามา หรือการแก้ภาพเบี้ยว (Perspective Correction) ซึ่งทำงานได้ครอบคลุมกว่าการแปลงแบบ Affine"
    },
    "color": "purple",
    "enabled": true
  },
  {
    "name": "Shapes — End-to-End Training & Evaluation",
    "description": "ANNOTATE + BUILD + TRAIN + EVALUATE + DETECT + GRAD-CAM",
    "descriptor": {
      "en": "Build a small annotated shapes dataset, train YOLO, then evaluate, detect, and explain its results.",
      "th": "สร้างชุดข้อมูลรูปทรงจากภาพที่ติดป้ายกำกับไว้ เทรน YOLO วัดผล แล้วตรวจจับและอธิบายผลด้วย Grad-CAM"
    },
    "longDescription": {
      "en": "Fine-tunes a selected YOLO base model for 100 epochs using nine annotated Shapes images. Detect, Grad-CAM and both evaluations use the newly trained weights. The bundled Shapes model is a fast starting point; when choosing a general-purpose model such as YOLOv8, YOLO11 or YOLO12, keep the 100-epoch setting or add more varied labelled images.",
      "th": "Fine-tune โมเดล YOLO ที่เลือกเป็นเวลา 100 รอบด้วยภาพ Shapes ที่มีป้ายกำกับ 9 ภาพ แล้วส่งโมเดลที่เทรนใหม่ไป Detect, Grad-CAM และ Evaluation ทั้งสองแบบ โมเดล Shapes ที่มากับระบบจะเริ่มต้นได้เร็ว ส่วนโมเดลทั่วไปอย่าง YOLOv8, YOLO11 หรือ YOLO12 ควรใช้ 100 รอบตามค่าเริ่มต้น หรือเพิ่มภาพที่ติดป้ายกำกับให้หลากหลายขึ้น"
    },
    "color": "cyan",
    "enabled": true
  },
  {
    "name": "Shapes — Detection & XAI",
    "description": "PRETRAINED MODEL + DETECT + GRAD-CAM",
    "descriptor": {
      "en": "Use the bundled trained Shapes model to run detection and Grad-CAM immediately.",
      "th": "ใช้โมเดล Shapes ที่รวมอยู่ใน VIPER เพื่อตรวจจับและสร้าง Grad-CAM ได้ทันที"
    },
    "longDescription": {
      "en": "An instant inference workflow using the bundled Shapes weights. It is useful for exploring the detection result and Grad-CAM without waiting for training.",
      "th": "workflow สำหรับทดลองใช้งานโมเดลที่เทรนไว้แล้ว เหมาะสำหรับดูผลการตรวจจับและ Grad-CAM ทันทีโดยไม่ต้องรอเทรน"
    },
    "color": "cyan",
    "enabled": true
  },
  {
    "name": "CLAHE (Contrast Limited Adaptive Histogram Equalization)",
    "description": "IMAGE + CLAHE",
    "descriptor": {
      "en": "ใส่สะอิ้ง",
      "th": "ใส่สะ"
    },
    "longDescription": {
      "en": "ใส่สะอิ้ง",
      "th": "ใส่สะ"
    },
    "color": "indigo",
    "enabled": false
  },
  {
    "name": "Real-ESRGAN (Super Resolution & Restoration)",
    "description": "IMAGE + REAL-ESRGAN",
    "descriptor": {
      "en": "ใส่สะอิ้ง",
      "th": "ใส่สะ"
    },
    "longDescription": {
      "en": "ใส่สะอิ้ง",
      "th": "ใส่สะ"
    },
    "color": "red",
    "enabled": false
  },
  {
    "name": "DeepLab V3+ (Semantic Segmentation)",
    "description": "IMAGE + DEEPLAB",
    "descriptor": {
      "en": "ใส่สะอิ้ง",
      "th": "ใส่สะ"
    },
    "longDescription": {
      "en": "ใส่สะอิ้ง",
      "th": "ใส่สะ"
    },
    "color": "yellow",
    "enabled": false
  }
];
