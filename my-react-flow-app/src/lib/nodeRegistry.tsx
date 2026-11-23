// src/lib/nodeRegistry.tsx
// The React component and the runner behind every entry of nodeCatalog.ts.
import type { ComponentType } from 'react';
import type { Edge, NodeProps, NodeTypes } from 'reactflow';

import { NODE_CATALOG, isNodeEnabled, nodeSpec, type NodeSpec, type NodeType } from './nodeCatalog';
import type { RFNode, SetNodes } from './runners/utils';
import type { CustomNodeData } from '../types';

import ImageInputNode from '../components/nodes/ImageInputNode';
import MultiImageInputNode from '../components/nodes/MultiImageInputNode';
import SiftNode from '../components/nodes/SiftNode';
import SurfNode from '../components/nodes/SurfNode';
import OrbNode from '../components/nodes/OrbNode';
import BrisqueNode from '../components/nodes/BrisqueNode';
import PsnrNode from '../components/nodes/PsnrNode';
import SsimNode from '../components/nodes/SsimNode';
import BFMatcherNode from '../components/nodes/BFMatcherNode';
import FLANNMatcherNode from '../components/nodes/FLANNMatcherNode';
import HomographyAlignNode from '../components/nodes/HomographyAlignNode';
import AffineAlignNode from '../components/nodes/AffineAlignNode';
import OtsuNode from '../components/nodes/OtsuNode';
import SnakeNode from '../components/nodes/SnakeNode';
import SaveImageNode from '../components/nodes/SaveImageNode';
import SaveJsonNode from '../components/nodes/SaveJsonNode';
import { YoloTrainNode, YoloDetectNode, YoloGradCAMNode } from '../components/nodes/YoloNodes';
import YoloDatasetNode from '../components/nodes/YoloDatasetNode';
import ClassificationEvaluationNode from '../components/nodes/ClassificationEvaluationNode';
import DetectionEvaluationNode from '../components/nodes/DetectionEvaluationNode';
import CLAHENode from '../components/nodes/CLAHE';
import MSRCRNode from '../components/nodes/MSRCR';
import ZeroDCENode from '../components/nodes/ZERO';
import DnCNNNode from '../components/nodes/DCNN';
import RealESRGANNode from '../components/nodes/REAL';
import SwinIRNode from '../components/nodes/SWINIR';
import DeepLabNode from '../components/nodes/DEEP';
import MaskRCNNNode from '../components/nodes/MASK';
import UNetNode from '../components/nodes/UNET';

import { runImageInput, runMultiImageInput } from './runners/input';
import { runFeature } from './runners/features';
import { runQuality } from './runners/quality';
import { runMatcher } from './runners/matching';
import { runAlignment } from './runners/alignment';
import { runOtsu, runSnakeRunner } from './runners/classification';
import { runSaveImage, runSaveJson } from './runners/saver';
import { runEnhancement } from './runners/enhancement';
import { runRestoration } from './runners/restoration';
import { runSegmentation } from './runners/segmentation';
import { runDetectionNode } from './runners/detection';
import { runYOLODatasetNode } from './runners/yoloDataset';
import { runClassificationEvaluationNode, runDetectionEvaluationNode } from './runners/evaluation';

/** Compute a node's result from its inputs and write it into the node's payload. Throws on failure. */
export type NodeRunner = (node: RFNode, setNodes: SetNodes, nodes: RFNode[], edges: Edge[]) => Promise<void>;

type NodeImpl = {
  component: ComponentType<NodeProps<CustomNodeData>>;
  run: NodeRunner;
};

const IMPLEMENTATIONS: Record<NodeType, NodeImpl> = {
  'image-input': { component: ImageInputNode, run: runImageInput },
  'multi-image-input': { component: MultiImageInputNode, run: runMultiImageInput },

  clahe: { component: CLAHENode, run: runEnhancement },
  msrcr: { component: MSRCRNode, run: runEnhancement },
  zeroDce: { component: ZeroDCENode, run: runEnhancement },

  dncnn: { component: DnCNNNode, run: runRestoration },
  realesrgan: { component: RealESRGANNode, run: runRestoration },
  swinir: { component: SwinIRNode, run: runRestoration },

  deeplab: { component: DeepLabNode, run: runSegmentation },
  maskrcnn: { component: MaskRCNNNode, run: runSegmentation },
  unet: { component: UNetNode, run: runSegmentation },

  sift: { component: SiftNode, run: runFeature },
  surf: { component: SurfNode, run: runFeature },
  orb: { component: OrbNode, run: runFeature },

  bfmatcher: { component: BFMatcherNode, run: runMatcher },
  flannmatcher: { component: FLANNMatcherNode, run: runMatcher },

  'homography-align': { component: HomographyAlignNode, run: runAlignment },
  'affine-align': { component: AffineAlignNode, run: runAlignment },

  otsu: { component: OtsuNode, run: runOtsu },
  snake: { component: SnakeNode, run: runSnakeRunner },

  'classification-evaluation': { component: ClassificationEvaluationNode, run: runClassificationEvaluationNode },
  'detection-evaluation': { component: DetectionEvaluationNode, run: runDetectionEvaluationNode },

  'yolo-dataset': { component: YoloDatasetNode, run: runYOLODatasetNode },
  'yolo-train': { component: YoloTrainNode, run: runDetectionNode },
  'yolo-detect': { component: YoloDetectNode, run: runDetectionNode },
  'yolo-gradcam': { component: YoloGradCAMNode, run: runDetectionNode },

  brisque: { component: BrisqueNode, run: runQuality },
  psnr: { component: PsnrNode, run: runQuality },
  ssim: { component: SsimNode, run: runQuality },

  'save-image': { component: SaveImageNode, run: runSaveImage },
  'save-json': { component: SaveJsonNode, run: runSaveJson },
};

/** The runner for a node type or alias; undefined for a type VIPER does not know. */
export function nodeRunner(type: string | undefined): NodeRunner | undefined {
  const spec = nodeSpec(type);
  return spec ? IMPLEMENTATIONS[spec.type as NodeType].run : undefined;
}

/** Components React Flow renders, for every enabled node under its type and aliases. */
export const nodeTypes: NodeTypes = Object.fromEntries(
  (NODE_CATALOG as readonly NodeSpec[])
    .filter(isNodeEnabled)
    .flatMap((spec) => [spec.type, ...(spec.aliases ?? [])].map((name) => [name, IMPLEMENTATIONS[spec.type as NodeType].component])),
);
