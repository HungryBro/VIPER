// src/lib/workflowTemplates.ts
import type { Edge, Node } from 'reactflow';
import type { CustomNodeData } from '../types';

export type WorkflowTemplate = {
  desc?: any;
  name: string;
  descriptor?: { en: string; th: string }; 
  description: string;
  longDescription?: { en: string; th: string }; 

  color: string;

  nodes: Node<CustomNodeData>[];
  edges: Edge[];
};

// --- Import Templates ---

// 1. Feature & Matching
import { FEATURE_EXTRACTION_SINGLE } from './templates/feature';
import { FEATURE_MATCHING_PIPELINE } from './templates/matching';

// 2. Classification
import {
  OTSU_CLASSIFICATION_TEMPLATE,
  SNAKE_CLASSIFICATION_TEMPLATE,
} from './templates/classification';

// 3. Alignment
import { OBJECT_ALIGNMENT_HOMOGRAPHY } from './templates/alignment';

// 4. Quality
import {
  PSNR_ASSESSMENT_TEMPLATE,
  BRISQUE_ASSESSMENT_TEMPLATE,
} from './templates/quality';
import {
  SHAPES_END_TO_END_TEMPLATE,
  SHAPES_INFERENCE_XAI_TEMPLATE,
} from './templates/detection';

// 5. ENHANCEMENT
// import { ENHANCEMENT_CLAHE_TEMPLATE } from './templates/enhancement';
// 6. Restoration
// import { RESTORATION_REALESRGAN_TEMPLATE } from './templates/restoration';
// 7. Segmentation
// import { SEGMENTATION_DEEPLAB_TEMPLATE } from './templates/segmentation';


export const TEMPLATES: WorkflowTemplate[] = [
  // Existing
  FEATURE_EXTRACTION_SINGLE,
  FEATURE_MATCHING_PIPELINE,
  PSNR_ASSESSMENT_TEMPLATE,
  BRISQUE_ASSESSMENT_TEMPLATE,
  OTSU_CLASSIFICATION_TEMPLATE,
  SNAKE_CLASSIFICATION_TEMPLATE,
  OBJECT_ALIGNMENT_HOMOGRAPHY,
  SHAPES_END_TO_END_TEMPLATE,
  SHAPES_INFERENCE_XAI_TEMPLATE,
  // ENHANCEMENT_CLAHE_TEMPLATE,
  // RESTORATION_REALESRGAN_TEMPLATE,
  // SEGMENTATION_DEEPLAB_TEMPLATE,
];
