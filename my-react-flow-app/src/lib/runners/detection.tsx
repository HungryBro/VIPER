import type React from 'react';
import type { Edge, Node as RFNode } from 'reactflow';
import type { CustomNodeData } from '../../types';
import { abs, runYOLODetect, runYOLOGradCAM, runYOLOTrain } from '../api';
import { findInputImage } from './utils';


type RF = RFNode<CustomNodeData>;
type SetNodes = React.Dispatch<React.SetStateAction<RF[]>>;
const DEFAULT_MODEL = 'yolo11n.pt';

function csvNumbers(value: unknown): number[] | undefined {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const numbers = value.split(',').map((item) => Number(item.trim())).filter(Number.isFinite);
  return numbers.length ? numbers : undefined;
}

function trainedModel(nodeId: string, nodes: RF[], edges: Edge[]): string | undefined {
  for (const edge of edges.filter((candidate) => candidate.target === nodeId)) {
    const parent = nodes.find((candidate) => candidate.id === edge.source);
    const path = parent?.data?.payload?.best_model_path || parent?.data?.payload?.model_path;
    if (typeof path === 'string') return path;
  }
  return undefined;
}

function datasetYaml(nodeId: string, nodes: RF[], edges: Edge[]): string | undefined {
  for (const edge of edges.filter((candidate) => candidate.target === nodeId)) {
    const parent = nodes.find((candidate) => candidate.id === edge.source);
    const path = parent?.data?.payload?.dataset_yaml;
    if (typeof path === 'string') return path;
  }
  return undefined;
}

function saveResult(nodeId: string, params: Record<string, any>, response: any, setNodes: SetNodes, image?: string) {
  setNodes((current) => current.map((node) => node.id === nodeId ? {
    ...node,
    data: {
      ...node.data,
      status: 'success',
      description: response.tool || 'YOLO completed',
      payload: {
        ...(node.data.payload || {}),
        params,
        json: response,
        json_path: response.json_path,
        json_url: response.json_url,
        best_model_path: response.best_model_path,
        model_path: response.best_model_path || response.model_path,
        result_image_url: image ? abs(image) : undefined,
        output_image: image ? abs(image) : undefined,
      },
    },
  } : node));
}

export async function runDetectionNode(node: RF, setNodes: SetNodes, nodes: RF[], edges: Edge[], signal?: AbortSignal) {
  const params = { ...(node.data?.payload?.params || {}) };
  if (node.type === 'yolo-train') {
    const dataset = datasetYaml(node.id, nodes, edges) || params.dataset_yaml;
    if (typeof dataset !== 'string' || !dataset.trim()) {
      throw new Error('Connect a YOLO Dataset Builder or set a Dataset YAML path before training.');
    }
    const trainParams = { ...params, dataset_yaml: dataset };
    const response = await runYOLOTrain(trainParams, signal);
    saveResult(node.id, trainParams, response, setNodes);
    return;
  }

  const imagePath = findInputImage(node.id, nodes, edges);
  if (!imagePath) throw new Error('Connect an Image Input or image-producing node.');
  const modelPath = trainedModel(node.id, nodes, edges) || DEFAULT_MODEL;

  if (node.type === 'yolo-detect') {
    const response = await runYOLODetect({ ...params, image_path: imagePath, model_path: modelPath }, signal);
    saveResult(node.id, params, response, setNodes, response.output_image_url);
    return;
  }

  const response = await runYOLOGradCAM({
    ...params,
    image_path: imagePath,
    model_path: modelPath,
    target_layers: csvNumbers(params.target_layers),
    target_class_ids: csvNumbers(params.target_class_ids),
  }, signal);
  saveResult(node.id, params, response, setNodes, response.overlay_url);
}
