import type { Edge, Node } from 'reactflow';
import type { CustomNodeData } from '../types';

export const DEFAULT_YOLO_MODEL = 'models/yolo11n.pt';

const modelPath = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

// Keep the displayed model and the inference request on the same source-selection rule.
export function resolveYoloModel(nodeId: string, nodes: Node<CustomNodeData>[], edges: Edge[], manualPath?: unknown) {
  const parents = edges.filter((edge) => edge.target === nodeId)
    .map((edge) => nodes.find((node) => node.id === edge.source));
  const train = parents.find((node) => node?.type === 'yolo-train');
  if (train) {
    return { path: modelPath(train.data.payload?.best_model_path), source: train };
  }
  for (const parent of parents) {
    const path = modelPath(parent?.data.payload?.best_model_path) || modelPath(parent?.data.payload?.model_path);
    if (parent && path) return { path, source: parent };
  }
  return { path: modelPath(manualPath) || DEFAULT_YOLO_MODEL, source: undefined };
}
