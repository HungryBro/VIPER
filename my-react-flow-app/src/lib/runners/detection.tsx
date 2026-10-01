import type React from 'react';
import type { Edge, Node as RFNode } from 'reactflow';
import type { CustomNodeData } from '../../types';
import { abs, getYOLOTrainJob, runYOLODetect, runYOLOGradCAM, startYOLOTrain } from '../api';
import { findInputImage } from './utils';
import { resolveYoloModel } from '../yoloModel';


type RF = RFNode<CustomNodeData>;
type SetNodes = React.Dispatch<React.SetStateAction<RF[]>>;

function csvNumbers(value: unknown): number[] | undefined {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const numbers = value.split(',').map((item) => Number(item.trim())).filter(Number.isFinite);
  return numbers.length ? numbers : undefined;
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

function saveTrainingProgress(nodeId: string, params: Record<string, any>, progress: any, setNodes: SetNodes) {
  setNodes((current) => current.map((node) => node.id === nodeId ? {
    ...node,
    data: {
      ...node.data,
      status: 'running',
      description: progress.message || 'Training YOLO…',
      payload: {
        ...(node.data.payload || {}),
        params,
        training_progress: {
          job_id: progress.job_id,
          current_epoch: Number(progress.current_epoch || 0),
          total_epochs: Number(progress.total_epochs || params.epochs || 0),
          progress: Number(progress.progress || 0),
          message: progress.message || '',
          cancel_requested: Boolean(progress.cancel_requested),
        },
      },
    },
  } : node));
}

export async function runDetectionNode(node: RF, setNodes: SetNodes, nodes: RF[], edges: Edge[], signal?: AbortSignal) {
  const params = { ...(node.data?.payload?.params || node.data?.params || {}) };
  if (node.type === 'yolo-train') {
    const dataset = datasetYaml(node.id, nodes, edges) || params.dataset_yaml;
    if (typeof dataset !== 'string' || !dataset.trim()) {
      throw new Error('Connect a YOLO Dataset Builder or set a Dataset YAML path before training.');
    }
    const trainParams = { ...params, dataset_yaml: dataset };
    const started = await startYOLOTrain(trainParams, signal);
    const jobId = started.job_id;
    if (!jobId) throw new Error('Could not start the YOLO training job.');

    let job = started;
    while (job.status === 'queued' || job.status === 'running') {
      saveTrainingProgress(node.id, trainParams, job, setNodes);
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(resolve, 500);
        signal?.addEventListener('abort', () => {
          window.clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
      job = await getYOLOTrainJob(jobId, signal);
    }
    if (job.status === 'fault') throw new Error(job.error || job.message || 'YOLO training failed.');
    if (job.status === 'canceled') {
      saveTrainingProgress(node.id, trainParams, job, setNodes);
      const canceled = new Error('Training canceled');
      (canceled as Error & { canceled?: boolean }).canceled = true;
      throw canceled;
    }
    saveTrainingProgress(node.id, trainParams, job, setNodes);
    const response = job.result;
    if (!response) throw new Error('YOLO training finished without a result.');
    saveResult(node.id, trainParams, response, setNodes);
    return;
  }

  const imagePath = findInputImage(node.id, nodes, edges);
  if (!imagePath) throw new Error('Connect an Image Input or image-producing node.');
  const { path: modelPath } = resolveYoloModel(node.id, nodes, edges, params.model_path);
  if (!modelPath) throw new Error('The connected YOLO Train has no trained model yet. Run it successfully before inference.');

  if (node.type === 'yolo-detect') {
    const response = await runYOLODetect({
      ...params,
      image_path: imagePath,
      model_path: modelPath,
      class_ids: csvNumbers(params.class_ids)?.filter((id) => Number.isInteger(id) && id >= 0),
    }, signal);
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
