import type { Edge } from 'reactflow';

import type { CustomNodeData } from '../../types';
import { runClassificationEvaluation, runDetectionEvaluation, runYOLOClassificationEvaluation } from '../api';
import { markStartThenRunning, type RFNode, type SetNodes } from './utils';

const EVALUATION_DEFAULTS = { confidence_threshold: 0.25, iou_threshold: 0.5, nms_iou_threshold: 0.7, image_size: 640 };

function isClassificationInput(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return Array.isArray(input.y_true) && Array.isArray(input.y_pred);
}

function connectedNode(node: RFNode, nodes: RFNode[], edges: Edge[], type: string) {
  return edges.filter((edge) => edge.target === node.id)
    .map((edge) => nodes.find((candidate) => candidate.id === edge.source))
    .find((candidate) => candidate?.type === type);
}

function classNames(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((name) => name.trim()).filter(Boolean);
  return typeof value === 'string' ? value.split(',').map((name) => name.trim()).filter(Boolean) : [];
}

function imagePath(payload: Record<string, any>): string | undefined {
  return [payload.path, payload.image_path, payload.url, payload.result_image_url]
    .find((value) => typeof value === 'string' && value.trim());
}

function imageAnnotations(payload: Record<string, any>, path: string): any[] | undefined {
  const entries = payload.annotations_by_image;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return undefined;
  const direct = entries[path];
  if (Array.isArray(direct)) return direct;
  const fileName = path.split('/').pop();
  const match = Object.entries(entries).find(([key]) => key.split('/').pop() === fileName)?.[1];
  return Array.isArray(match) ? match : undefined;
}

function failNode(node: RFNode, setNodes: SetNodes, message: string): never {
  setNodes((current) => current.map((item) => item.id === node.id ? { ...item, data: { ...item.data, status: 'fault', description: message } } : item));
  throw new Error(message);
}

export async function runClassificationEvaluationNode(
  node: RFNode,
  setNodes: SetNodes,
  nodes: RFNode[],
  edges: Edge[],
  signal?: AbortSignal,
) {
  const inputMode = node.data?.payload?.evaluation_input_mode === 'file' ? 'file' : 'yolo';
  const fail = (message: string) => failNode(node, setNodes, message);
  let response: any;
  try {
    await markStartThenRunning(node.id, 'Classification Evaluation', setNodes);
    if (inputMode === 'file') {
      const input = node.data?.payload?.evaluation_input;
      if (!isClassificationInput(input)) return fail('Choose a Classification Evaluation JSON file containing y_true and y_pred.');
      response = await runClassificationEvaluation(input, signal);
    } else {
      const datasetNode = connectedNode(node, nodes, edges, 'yolo-dataset');
      const trainNode = connectedNode(node, nodes, edges, 'yolo-train');
      const imageNode = connectedNode(node, nodes, edges, 'image-input');
      const datasetPayload = datasetNode?.data?.payload || {};
      const trainPayload = trainNode?.data?.payload || {};
      const testPayload = imageNode?.data?.payload || {};
      const path = imagePath(testPayload);
      const annotations = path ? imageAnnotations(datasetPayload, path) : undefined;
      const names = classNames(datasetPayload.class_names);
      // This evaluation uses the Builder's labels directly.  It does not need
      // the generated YAML file, so use the completed-node state rather than
      // requiring a transient dataset_yaml value from the previous run.
      if (!datasetNode || datasetNode.data?.status !== 'success') return fail('Connect a completed YOLO Dataset Builder node.');
      if (!trainPayload.best_model_path) return fail('Connect a completed YOLO Train node.');
      if (!path) return fail('Connect a Test Image with an uploaded image.');
      if (!names.length || !annotations?.length) return fail('Use a Test Image that belongs to the connected labelled YOLO Dataset Builder.');
      const raw = { ...EVALUATION_DEFAULTS, ...(node.data?.payload?.params || {}) };
      const params = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Number(value)]));
      response = await runYOLOClassificationEvaluation({
        image_path: path,
        model_path: trainPayload.best_model_path,
        class_names: names,
        annotations,
        ...params,
      }, signal);
    }
    const accuracy = Number(response?.metrics?.accuracy);
    setNodes((current) => current.map((item) => item.id === node.id ? {
      ...item,
      data: {
        ...item.data,
        status: 'success',
        description: Number.isFinite(accuracy) ? `Accuracy ${(accuracy * 100).toFixed(1)}%` : 'Classification evaluation completed',
        payload: { ...(item.data?.payload || {}), json: response, evaluation_result: response, output: response, json_path: response.json_path, json_url: response.json_url },
      } as CustomNodeData,
    } : item));
  } catch (error: any) {
    if (error?.name === 'AbortError') return;
    return fail(error?.message || 'Classification evaluation failed.');
  }
}

function connectedOutput(node: RFNode, nodes: RFNode[], edges: Edge[], sourceType: string, key: string): string | undefined {
  const value = connectedNode(node, nodes, edges, sourceType)?.data?.payload?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export async function runDetectionEvaluationNode(node: RFNode, setNodes: SetNodes, nodes: RFNode[], edges: Edge[], signal?: AbortSignal) {
  const fail = (message: string) => failNode(node, setNodes, message);
  const datasetYaml = connectedOutput(node, nodes, edges, 'yolo-dataset', 'dataset_yaml');
  const modelPath = connectedOutput(node, nodes, edges, 'yolo-train', 'best_model_path');
  if (!datasetYaml) return fail('Connect a completed YOLO Dataset Builder node.');
  if (!modelPath) return fail('Connect a completed YOLO Train node.');
  const rawParams = { ...EVALUATION_DEFAULTS, ...(node.data?.payload?.params || {}) };
  const params = { confidence_threshold: Number(rawParams.confidence_threshold), iou_threshold: Number(rawParams.iou_threshold), nms_iou_threshold: Number(rawParams.nms_iou_threshold), image_size: Number(rawParams.image_size) };
  await markStartThenRunning(node.id, 'Detection Evaluation', setNodes);
  try {
    const response = await runDetectionEvaluation({ dataset_yaml: datasetYaml, model_path: modelPath, ...params }, signal);
    const rate = Number(response?.metrics?.detection_rate);
    setNodes((current) => current.map((item) => item.id === node.id ? { ...item, data: { ...item.data, status: 'success', description: Number.isFinite(rate) ? `Detection rate ${(rate * 100).toFixed(1)}%` : 'Detection evaluation completed', payload: { ...(item.data?.payload || {}), params, json: response, evaluation_result: response, output: response, json_path: response.json_path, json_url: response.json_url } } as CustomNodeData } : item));
  } catch (error: any) {
    if (error?.name === 'AbortError') return;
    return fail(error?.message || 'Detection evaluation failed.');
  }
}
