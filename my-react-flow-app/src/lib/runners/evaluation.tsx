import type { Edge } from 'reactflow';

import type { CustomNodeData } from '../../types';
import { runClassificationEvaluation } from '../api';
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
