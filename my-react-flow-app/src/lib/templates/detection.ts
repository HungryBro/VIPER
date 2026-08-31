import type { Node } from 'reactflow';
import type { WorkflowTemplate } from '../workflowTemplates';

const SAMPLE_ROOT = '/static/samples/shapes-yolo';
const MODEL_PATH = 'models/shapes-best.pt';

const samplePath = (name: string) => `${SAMPLE_ROOT}/${name}`;

const datasetImages = [
  'multi_000.jpg',
  'multi_001.jpg',
  'multi_002.jpg',
  'multi_003.jpg',
  'multi_004.jpg',
  'multi_005.jpg',
  'circle_000.jpg',
  'triangle_000.jpg',
  'square_000.jpg',
].map((name) => ({ name, path: samplePath(name), url: samplePath(name), width: 640, height: 640 }));

// Converted from the YOLO labels bundled with this sample pack.
// The Dataset Builder stores top-left x/y, while YOLO labels store centre x/y.
const annotationsByImage = {
  [samplePath('multi_000.jpg')]: [
    { class_id: 1, x: 0.125781, y: 0.652344, width: 0.25, height: 0.25 },
    { class_id: 0, x: 0.182032, y: 0.017969, width: 0.229687, height: 0.229687 },
  ],
  [samplePath('multi_001.jpg')]: [
    { class_id: 2, x: 0.139844, y: 0.132031, width: 0.317188, height: 0.317188 },
    { class_id: 0, x: 0.663282, y: 0.074219, width: 0.195312, height: 0.195312 },
  ],
  [samplePath('multi_002.jpg')]: [
    { class_id: 2, x: 0.580469, y: 0.507031, width: 0.298438, height: 0.298438 },
    { class_id: 1, x: 0.197657, y: 0.678906, width: 0.198437, height: 0.173437 },
  ],
  [samplePath('multi_003.jpg')]: [
    { class_id: 2, x: 0.303906, y: 0.385157, width: 0.235937, height: 0.235937 },
    { class_id: 0, x: 0.567968, y: 0.480468, width: 0.176563, height: 0.176563 },
    { class_id: 1, x: 0.594531, y: 0.214844, width: 0.195312, height: 0.226562 },
  ],
  [samplePath('multi_004.jpg')]: [
    { class_id: 1, x: 0.446094, y: 0.152343, width: 0.276562, height: 0.317188 },
    { class_id: 0, x: 0.561719, y: 0.486718, width: 0.273438, height: 0.273438 },
  ],
  [samplePath('multi_005.jpg')]: [
    { class_id: 2, x: 0.699219, y: 0.142969, width: 0.189062, height: 0.189062 },
    { class_id: 0, x: 0.603907, y: 0.439844, width: 0.232813, height: 0.232813 },
  ],
  [samplePath('circle_000.jpg')]: [
    { class_id: 0, x: 0.316406, y: 0.547656, width: 0.317188, height: 0.317188 },
  ],
  [samplePath('triangle_000.jpg')]: [
    { class_id: 1, x: 0.391406, y: 0.444531, width: 0.376563, height: 0.340625 },
  ],
  [samplePath('square_000.jpg')]: [
    { class_id: 2, x: 0.269532, y: 0.100782, width: 0.345313, height: 0.345313 },
  ],
};

const edgeStyle = { strokeWidth: 2, stroke: '#22d3ee' };

const testImagePayload = {
  name: 'multi_003.jpg',
  path: samplePath('multi_003.jpg'),
  url: samplePath('multi_003.jpg'),
  result_image_url: samplePath('multi_003.jpg'),
  width: 640,
  height: 640,
};

export const SHAPES_END_TO_END_TEMPLATE: WorkflowTemplate = {
  name: 'Shapes — End-to-End Training & Evaluation',
  descriptor: {
    en: 'Build a small annotated shapes dataset, train YOLO, then evaluate, detect, and explain its results.',
    th: 'สร้างชุดข้อมูลรูปทรงจากภาพที่ติดป้ายกำกับไว้ เทรน YOLO วัดผล แล้วตรวจจับและอธิบายผลด้วย Grad-CAM',
  },
  description: 'ANNOTATE + BUILD + TRAIN + EVALUATE + DETECT + GRAD-CAM',
  longDescription: {
    en: 'A self-contained demonstration of the full YOLO workflow. It includes nine annotated circle, triangle, and square images, plus a test image. After training, Detection Evaluation measures the validation split, while Classification Evaluation compares the predicted and labelled classes on the connected test image. The short training configuration is intended for learning the workflow rather than model accuracy.',
    th: 'ตัวอย่าง workflow YOLO แบบครบเส้นทาง ใช้ภาพวงกลม สามเหลี่ยม และสี่เหลี่ยมที่มีกรอบกำกับไว้ 9 ภาพ พร้อมภาพทดสอบ หลังเทรนจะมีทั้ง Detection Evaluation สำหรับ Validation split และ Classification Evaluation ที่เปรียบเทียบคลาสของภาพทดสอบที่เชื่อมอยู่ โดยตั้งค่าเทรนระยะสั้นเพื่อสาธิตลำดับงาน ไม่ได้มุ่งผลความแม่นยำสูงสุด',
  },
  color: 'cyan',
  nodes: [
    {
      id: 'shapes-e2e-images',
      type: 'multi-image-input',
      position: { x: -28.65850339859901, y: 647.035313276307 },
      data: {
        label: 'Shapes Dataset Images',
        status: 'idle',
        description: '9 preloaded annotated images: circle, triangle, square.',
        payload: { dataset_images: datasetImages },
      },
    } as Node,
    {
      id: 'shapes-e2e-dataset',
      type: 'yolo-dataset',
      position: { x: 330, y: 190 },
      data: {
        label: 'Build Shapes Dataset',
        status: 'idle',
        description: 'Bounding boxes are preloaded from the bundled sample labels.',
        payload: {
          class_names: 'circle, triangle, square',
          annotations_by_image: annotationsByImage,
        },
      },
    } as Node,
    {
      id: 'shapes-e2e-train',
      type: 'yolo-train',
      position: { x: 860, y: 70 },
      data: {
        label: 'Train Shapes YOLO',
        status: 'idle',
        description: 'Short demo training run.',
        payload: { params: { model_path: 'models/yolo11n.pt', epochs: 5, image_size: 640, batch: 4 } },
      },
    } as Node,
    {
      id: 'shapes-e2e-test-image',
      type: 'image-input',
      position: { x: 858.3700451187246, y: 363.8779010387507 },
      data: {
        label: 'Image Input',
        status: 'idle',
        description: 'Preloaded shapes image for inference and XAI.',
        payload: testImagePayload,
      },
    } as Node,
    {
      id: 'shapes-e2e-detect',
      type: 'yolo-detect',
      position: { x: 1280.743091193914, y: 68.12138907804595 },
      data: {
        label: 'Detect Shapes',
        status: 'idle',
        description: 'Runs the freshly trained model on the test image.',
        payload: { params: { model_path: 'models/yolo11n.pt', confidence: 0.25, iou: 0.7, image_size: 640 } },
      },
    } as Node,
    {
      id: 'shapes-e2e-gradcam',
      type: 'yolo-gradcam',
      position: { x: 1281.8648620746717, y: 504.9114710869171 },
      data: {
        label: 'Explain Shapes Detection',
        status: 'idle',
        description: 'Visualises the detector focus with Grad-CAM.',
        payload: { params: { model_path: 'models/yolo11n.pt', method: 'GradCAM', confidence: 0.2, target_layers: '', target_class_ids: '' } },
      },
    } as Node,
    {
      id: 'shapes-e2e-evaluation',
      type: 'detection-evaluation',
      position: { x: 853.6627411167512, y: 972.0942131979696 },
      data: {
        label: 'Evaluate Shapes Model',
        status: 'idle',
        description: 'Runs the trained model against the dataset validation split.',
        payload: {
          params: {
            confidence_threshold: 0.25,
            iou_threshold: 0.5,
            nms_iou_threshold: 0.7,
            image_size: 640,
          },
        },
      },
    } as Node,
    {
      id: 'shapes-e2e-classification-evaluation',
      type: 'classification-evaluation',
      position: { x: 342.1877689016443, y: 973.780169750989 },
      data: {
        label: 'Classify Shapes Test Result',
        status: 'idle',
        description: 'Compares the trained YOLO prediction with the Test Image labels.',
        payload: {
          evaluation_input_mode: 'yolo',
          params: {
            confidence_threshold: 0.25,
            iou_threshold: 0.5,
            nms_iou_threshold: 0.7,
            image_size: 640,
          },
        },
      },
    } as Node,
  ],
  edges: [
    { id: 'shapes-e2e-images-dataset', source: 'shapes-e2e-images', sourceHandle: 'images', target: 'shapes-e2e-dataset', targetHandle: 'images', type: 'smoothstep', style: edgeStyle },
    { id: 'shapes-e2e-dataset-train', source: 'shapes-e2e-dataset', sourceHandle: 'dataset', target: 'shapes-e2e-train', type: 'smoothstep', style: edgeStyle },
    { id: 'shapes-e2e-train-detect', source: 'shapes-e2e-train', target: 'shapes-e2e-detect', type: 'smoothstep', style: edgeStyle },
    { id: 'shapes-e2e-image-detect', source: 'shapes-e2e-test-image', sourceHandle: 'img', target: 'shapes-e2e-detect', type: 'smoothstep', style: edgeStyle },
    { id: 'shapes-e2e-train-gradcam', source: 'shapes-e2e-train', target: 'shapes-e2e-gradcam', type: 'smoothstep', style: edgeStyle },
    { id: 'shapes-e2e-image-gradcam', source: 'shapes-e2e-test-image', sourceHandle: 'img', target: 'shapes-e2e-gradcam', type: 'smoothstep', style: edgeStyle },
    { id: 'shapes-e2e-dataset-evaluation', source: 'shapes-e2e-dataset', sourceHandle: 'dataset', target: 'shapes-e2e-evaluation', targetHandle: 'dataset', type: 'smoothstep', style: edgeStyle },
    { id: 'shapes-e2e-train-evaluation', source: 'shapes-e2e-train', target: 'shapes-e2e-evaluation', targetHandle: 'model', type: 'smoothstep', style: edgeStyle },
    { id: 'shapes-e2e-dataset-classification-evaluation', source: 'shapes-e2e-dataset', sourceHandle: 'dataset', target: 'shapes-e2e-classification-evaluation', targetHandle: 'dataset', type: 'smoothstep', style: edgeStyle },
    { id: 'shapes-e2e-train-classification-evaluation', source: 'shapes-e2e-train', target: 'shapes-e2e-classification-evaluation', targetHandle: 'model', type: 'smoothstep', style: edgeStyle },
    { id: 'shapes-e2e-image-classification-evaluation', source: 'shapes-e2e-test-image', sourceHandle: 'img', target: 'shapes-e2e-classification-evaluation', targetHandle: 'image', type: 'smoothstep', style: edgeStyle },
  ],
};

export const SHAPES_INFERENCE_XAI_TEMPLATE: WorkflowTemplate = {
  name: 'Shapes — Detection & XAI',
  descriptor: {
    en: 'Use the bundled trained Shapes model to run detection and Grad-CAM immediately.',
    th: 'ใช้โมเดล Shapes ที่รวมอยู่ใน VIPER เพื่อตรวจจับและสร้าง Grad-CAM ได้ทันที',
  },
  description: 'PRETRAINED MODEL + DETECT + GRAD-CAM',
  longDescription: {
    en: 'An instant inference workflow using the bundled Shapes weights. It is useful for exploring the detection result and Grad-CAM without waiting for training.',
    th: 'workflow สำหรับทดลองใช้งานโมเดลที่เทรนไว้แล้ว เหมาะสำหรับดูผลการตรวจจับและ Grad-CAM ทันทีโดยไม่ต้องรอเทรน',
  },
  color: 'cyan',
  nodes: [
    {
      id: 'shapes-xai-test-image',
      type: 'image-input',
      position: { x: 0, y: 180 },
      data: {
        label: 'Image Input',
        status: 'idle',
        description: 'Preloaded shapes image.',
        payload: testImagePayload,
      },
    } as Node,
    {
      id: 'shapes-xai-detect',
      type: 'yolo-detect',
      position: { x: 390, y: 20 },
      data: {
        label: 'Detect with Shapes Model',
        status: 'idle',
        description: 'Uses the bundled Shapes weights.',
        payload: { params: { model_path: MODEL_PATH, confidence: 0.25, iou: 0.7, image_size: 640 } },
      },
    } as Node,
    {
      id: 'shapes-xai-gradcam',
      type: 'yolo-gradcam',
      position: { x: 390, y: 457.406 },
      data: {
        label: 'Grad-CAM with Shapes Model',
        status: 'idle',
        description: 'Uses the bundled Shapes weights.',
        payload: { params: { model_path: MODEL_PATH, method: 'GradCAM', confidence: 0.2, target_layers: '', target_class_ids: '' } },
      },
    } as Node,
  ],
  edges: [
    { id: 'shapes-xai-image-detect', source: 'shapes-xai-test-image', sourceHandle: 'img', target: 'shapes-xai-detect', type: 'smoothstep', style: edgeStyle },
    { id: 'shapes-xai-image-gradcam', source: 'shapes-xai-test-image', sourceHandle: 'img', target: 'shapes-xai-gradcam', type: 'smoothstep', style: edgeStyle },
  ],
};
