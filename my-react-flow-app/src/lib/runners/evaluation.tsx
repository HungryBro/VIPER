import type { Edge } from 'reactflow';

import type { CustomNodeData } from '../../types';
import { runClassificationEvaluation, runDetectionEvaluation } from '../api';
import { markStartThenRunning, type RFNode, type SetNodes } from './utils';


export async function runClassificationEvaluationNode(
  node: RFNode,
  setNodes: SetNodes,
  _nodes: RFNode[],
  _edges: Edge[],
  signal?: AbortSignal,
) {
  const input = node.data?.payload?.evaluation_input;
  const fail = (message: string) => {
    setNodes((current) => current.map((item) => item.id === node.id ? {
      ...item,
      data: { ...item.data, status: 'fault', description: message },
    } : item));
    throw new Error(message);
  };

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return fail('Choose a Classification Evaluation JSON file first.');
  }

  await markStartThenRunning(node.id, 'Classification Evaluation', setNodes);
  try {
    const response = await runClassificationEvaluation(input, signal);
    const accuracy = Number(response?.metrics?.accuracy);
    const description = Number.isFinite(accuracy)
      ? `Accuracy ${(accuracy * 100).toFixed(1)}%`
      : 'Classification evaluation completed';

    setNodes((current) => current.map((item) => item.id === node.id ? {
      ...item,
      data: {
        ...item.data,
        status: 'success',
        description,
        payload: {
          ...(item.data?.payload || {}),
          json: response,
          evaluation_result: response,
          output: response,
        },
      } as CustomNodeData,
    } : item));
  } catch (error: any) {
    if (error?.name === 'AbortError') return;
    return fail(error?.message || 'Classification evaluation failed.');
  }
}

const DETECTION_DEFAULTS = {
  confidence_threshold: 0.25,
  iou_threshold: 0.5,
  nms_iou_threshold: 0.7,
  image_size: 640,
};

function connectedOutput(node: RFNode, nodes: RFNode[], edges: Edge[], sourceType: string, key: string): string | undefined {
  const source = edges
    .filter((edge) => edge.target === node.id)
    .map((edge) => nodes.find((candidate) => candidate.id === edge.source))
    .find((candidate) => candidate?.type === sourceType);
  const value = source?.data?.payload?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export async function runDetectionEvaluationNode(
  node: RFNode,
  setNodes: SetNodes,
  nodes: RFNode[],
  edges: Edge[],
  signal?: AbortSignal,
) {
  const fail = (message: string) => {
    setNodes((current) => current.map((item) => item.id === node.id ? {
      ...item,
      data: { ...item.data, status: 'fault', description: message },
    } : item));
    throw new Error(message);
  };

  const datasetYaml = connectedOutput(node, nodes, edges, 'yolo-dataset', 'dataset_yaml');
  const modelPath = connectedOutput(node, nodes, edges, 'yolo-train', 'best_model_path');
  if (!datasetYaml) return fail('Connect a completed YOLO Dataset Builder node.');
  if (!modelPath) return fail('Connect a completed YOLO Train node.');

  const rawParams = { ...DETECTION_DEFAULTS, ...(node.data?.payload?.params || {}) };
  const params = {
    confidence_threshold: Number(rawParams.confidence_threshold),
    iou_threshold: Number(rawParams.iou_threshold),
    nms_iou_threshold: Number(rawParams.nms_iou_threshold),
    image_size: Number(rawParams.image_size),
  };

  await markStartThenRunning(node.id, 'Detection Evaluation', setNodes);
  try {
    const response = await runDetectionEvaluation({ dataset_yaml: datasetYaml, model_path: modelPath, ...params }, signal);
    const rate = Number(response?.metrics?.detection_rate);
    const description = Number.isFinite(rate)
      ? `Detection rate ${(rate * 100).toFixed(1)}%`
      : 'Detection evaluation completed';

    setNodes((current) => current.map((item) => item.id === node.id ? {
      ...item,
      data: {
        ...item.data,
        status: 'success',
        description,
        payload: {
          ...(item.data?.payload || {}),
          params,
          json: response,
          evaluation_result: response,
          output: response,
          json_path: response.json_path,
          json_url: response.json_url,
        },
      } as CustomNodeData,
    } : item));
  } catch (error: any) {
    if (error?.name === 'AbortError') return;
    return fail(error?.message || 'Detection evaluation failed.');
  }
}
