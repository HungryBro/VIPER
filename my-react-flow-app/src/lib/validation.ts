// File: src/lib/validation.ts
import { getOutgoers } from 'reactflow';
import type { Node, Edge, Connection } from 'reactflow';
import type { CustomNodeData } from '../types'; 

export type ValidationResult = {
  isValid: boolean;
  message?: string;
};


const NODE_RULES: Record<string, { inputs: string[]; output: string }> = {
  // --- Source ---
  'image-input': { inputs: [], output: 'image' },
  'multi-image-input': { inputs: [], output: 'images' },

  // --- Features ---
  'sift': { inputs: ['image'], output: 'feature' },
  'surf': { inputs: ['image'], output: 'feature' },
  'orb': { inputs: ['image'], output: 'feature' },

  // --- Matching ---
  'bfmatcher': { inputs: ['feature'], output: 'match' },
  'flannmatcher': { inputs: ['feature'], output: 'match' },

  // --- Alignment ---
  'homography-align': { inputs: ['match'], output: 'image' },
  'affine-align': { inputs: ['match'], output: 'image' },

  // --- Enhancement / Processing ---
  'clahe': { inputs: ['image'], output: 'image' },
  'msrcr': { inputs: ['image'], output: 'image' },
  'zero': { inputs: ['image'], output: 'image' },
  'zerodce': { inputs: ['image'], output: 'image' },
  'zero-dce': { inputs: ['image'], output: 'image' },
  'zero_dce': { inputs: ['image'], output: 'image' },
  'dncnn': { inputs: ['image'], output: 'image' },
  'dcnn': { inputs: ['image'], output: 'image' },
  'swinir': { inputs: ['image'], output: 'image' },
  'real': { inputs: ['image'], output: 'image' },
  'real-esrgan': { inputs: ['image'], output: 'image' },
  'realesrgan': { inputs: ['image'], output: 'image' },

  // --- Segmentation ---
  'deep': { inputs: ['image'], output: 'image' },
  'deeplab': { inputs: ['image'], output: 'image' },
  'mask': { inputs: ['image'], output: 'image' },
  'maskrcnn': { inputs: ['image'], output: 'image' },
  'unet': { inputs: ['image'], output: 'image' },

  // --- Classification / Logic ---
  'otsu': { inputs: ['image'], output: 'mask' },
  'snake': { inputs: ['image'], output: 'mask' },

  // --- Object Detection / XAI ---
  'yolo-dataset': { inputs: ['images'], output: 'dataset' },
  'yolo-train': { inputs: ['dataset'], output: 'model' },
  'yolo-detect': { inputs: ['image', 'model'], output: 'image' },
  'yolo-gradcam': { inputs: ['image', 'model'], output: 'image' },

  // --- Evaluation ---
  'classification-evaluation': { inputs: ['dataset', 'model', 'image'], output: 'metric' },
  'detection-evaluation': { inputs: ['dataset', 'model'], output: 'metric' },

  // --- Quality Metrics ---
  'brisque': { inputs: ['image'], output: 'metric' },
  'psnr': { inputs: ['image', 'image'], output: 'metric' },
  'ssim': { inputs: ['image', 'image'], output: 'metric' },

  // --- Output Nodes (Flexible Savers) ---
  'save-image': { 
      inputs: ['image', 'feature', 'match', 'metric','mask'], 
      output: 'none' 
  },
  'save-json': { 
      inputs: ['any'], 
      output: 'none' 
  }, 
};

function isTypeCompatible(sourceType: string, targetType: string): boolean {
  const sourceRule = NODE_RULES[sourceType.toLowerCase()];
  const targetRule = NODE_RULES[targetType.toLowerCase()];

  if (!sourceRule || !targetRule) return true;

  const outputType = sourceRule.output;
  const allowedInputs = targetRule.inputs;

  if (allowedInputs.includes('any')) return true;
  if (allowedInputs.includes(outputType)) return true;

  return false;
}

export function hasCycle(connection: Connection, nodes: Node[], edges: Edge[]): boolean {
  const targetNode = nodes.find((n) => n.id === connection.target);
  const sourceNode = nodes.find((n) => n.id === connection.source);

  if (!targetNode || !sourceNode) return false;
  if (connection.source === connection.target) return true;

  const check = (node: Node, visited: Set<string>): boolean => {
    if (visited.has(node.id)) return false;
    visited.add(node.id);
    const outgoers = getOutgoers(node, nodes, edges);
    if (outgoers.some((n) => n.id === sourceNode.id)) return true;
    return outgoers.some((n) => check(n, visited));
  };

  return check(targetNode, new Set());
}

export function validateConnection(connection: Connection, nodes: Node[], edges: Edge[]): boolean {
  if (hasCycle(connection, nodes, edges)) return false;

  const sourceNode = nodes.find((n) => n.id === connection.source);
  const targetNode = nodes.find((n) => n.id === connection.target);

  if (sourceNode && targetNode) {
    if (!isTypeCompatible(sourceNode.type || '', targetNode.type || '')) {
      return false;
    }
  }
  return true;
}



const getDescriptorDimension = (node?: Node<CustomNodeData>): number => {
    if (!node) return 0;
    const type = node.type?.toLowerCase() || '';
    const params = node.data?.params || node.data?.payload?.params || {};

    if (type === 'sift') return 128; 
    if (type === 'orb') return 32; 

    if (type === 'surf') {
        const isExtended = params.extended === true || params.extended === 1 || params.extended === '1';
        return isExtended ? 128 : 64;
    }

    return 0; 
};

export function validateNodeInput(
  nodeId: string,
  nodes: Node<CustomNodeData>[],
  edges: Edge[]
): ValidationResult {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) {
    return { isValid: false, message: 'Node not found in graph.' };
  }

  const incomingEdges = edges.filter((e) => e.target === nodeId);
  const inputCount = incomingEdges.length;
  const type = (node.type || '').toLowerCase();

  switch (type) {
    case 'image-input':
      if (!node.data?.payload?.url && !node.data?.payload?.image_path) {
         if (node.data.status !== 'success') {
             return { isValid: false, message: 'Please upload an image first.' };
         }
      }
      break;

    case 'multi-image-input':
      if (!Array.isArray(node.data?.payload?.dataset_images) || node.data.payload.dataset_images.length < 2) {
        return { isValid: false, message: 'Upload at least 2 images for the YOLO dataset.' };
      }
      break;

    case 'classification-evaluation': {
      const inputMode = node.data?.payload?.evaluation_input_mode === 'file' ? 'file' : 'yolo';
      const localInput = node.data?.payload?.evaluation_input;
      const hasLocalInput = localInput && typeof localInput === 'object' && !Array.isArray(localInput)
        && Array.isArray(localInput.y_true) && Array.isArray(localInput.y_pred);
      if (inputMode === 'file' && !hasLocalInput) {
        return { isValid: false, message: 'Choose a Classification Evaluation JSON file containing y_true and y_pred.' };
      }
      if (inputMode === 'yolo') {
        const sourceNodes = incomingEdges.map((edge) => nodes.find((candidate) => candidate.id === edge.source));
        const datasetNode = sourceNodes.find((candidate) => candidate?.type === 'yolo-dataset');
        const trainNode = sourceNodes.find((candidate) => candidate?.type === 'yolo-train');
        const imageNode = sourceNodes.find((candidate) => candidate?.type === 'image-input');
        if (!datasetNode || datasetNode.data?.status !== 'success') return { isValid: false, message: 'Connect a completed YOLO Dataset Builder node.' };
        if (!trainNode?.data?.payload?.best_model_path) return { isValid: false, message: 'Connect a completed YOLO Train node.' };
        if (!imageNode?.data?.payload?.path && !imageNode?.data?.payload?.url) return { isValid: false, message: 'Connect a Test Image node.' };
      }
      break;
    }

    case 'detection-evaluation': {
      const sourceNodes = incomingEdges
        .map((edge) => nodes.find((candidate) => candidate.id === edge.source));
      const datasetNode = sourceNodes.find((candidate) => candidate?.type === 'yolo-dataset');
      const trainNode = sourceNodes.find((candidate) => candidate?.type === 'yolo-train');
      if (!datasetNode?.data?.payload?.dataset_yaml) {
        return { isValid: false, message: 'Connect a completed YOLO Dataset Builder node.' };
      }
      if (!trainNode?.data?.payload?.best_model_path) {
        return { isValid: false, message: 'Connect a completed YOLO Train node.' };
      }
      break;
    }

    case 'yolo-dataset':
      if (inputCount < 1) {
        return { isValid: false, message: 'Connect a Multi Image Input node before building the dataset.' };
      }
      break;

    case 'yolo-train':
      if (inputCount < 1 && !node.data?.payload?.params?.dataset_yaml) {
        return { isValid: false, message: 'Connect a YOLO Dataset Builder or set a Dataset YAML path.' };
      }
      break;

    case 'bfmatcher':
    case 'flannmatcher': {
      if (inputCount < 2) {
        return { isValid: false, message: 'Requires 2 inputs (Feature A & Feature B).' };
      }

      const sourceNodes = incomingEdges.map(e => nodes.find(n => n.id === e.source));
      const nodeA = sourceNodes[0];
      const nodeB = sourceNodes[1];

      if (!nodeA || !nodeB) return { isValid: true };

      const dimA = getDescriptorDimension(nodeA);
      const dimB = getDescriptorDimension(nodeB);

      if (dimA > 0 && dimB > 0) {
          if (nodeA.type !== nodeB.type) {
             return { 
                isValid: false, 
                message: `Type Mismatch: Cannot match '${nodeA.type?.toUpperCase()}' with '${nodeB.type?.toUpperCase()}'.` 
             };
          }
          if (dimA !== dimB) {
              return { 
                  isValid: false, 
                  message: `Dimension Mismatch: Input A is ${dimA}-dim, but Input B is ${dimB}-dim. Check 'Extended' parameter.` 
              };
          }
      }
      break;
    }

    case 'psnr':
    case 'ssim':
      if (inputCount < 2) {
        return { isValid: false, message: 'Requires 2 inputs (Original & Processed).' };
      }
      break;
    
    case 'homography-align':
    case 'affine-align':
      if (inputCount < 1) {
          return { isValid: false, message: 'Missing Matcher input.' };
      }
      break;

    default:
      if (inputCount < 1 && !['image-input', 'multi-image-input'].includes(type)) {
          return { isValid: false, message: 'Missing input connection.' };
      }
      break;
  }

  return { isValid: true };
}
