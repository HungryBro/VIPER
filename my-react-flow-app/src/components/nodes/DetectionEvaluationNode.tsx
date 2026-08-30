import { memo, useCallback, useMemo } from 'react';
import { Handle, Position, type NodeProps, useEdges, useNodes, useReactFlow } from 'reactflow';

import type { CustomNodeData } from '../../types';


const DEFAULTS = {
  confidence_threshold: 0.25,
  iou_threshold: 0.5,
  nms_iou_threshold: 0.7,
  image_size: 640,
};

function percent(value: unknown): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${(numeric * 100).toFixed(1)}%` : '—';
}

function number(value: unknown, digits = 0): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : '—';
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded bg-gray-900 p-2 text-center">
    <p className="text-[9px] uppercase tracking-wide text-gray-500">{label}</p>
    <p className="mt-1 text-sm font-semibold text-amber-200">{value}</p>
  </div>;
}

const DetectionEvaluationNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const { setNodes } = useReactFlow();
  const nodes = useNodes<CustomNodeData>();
  const edges = useEdges();
  const isRunning = data.status === 'start' || data.status === 'running';
  const result = data.payload?.evaluation_result || data.payload?.json;
  const metrics = result?.metrics || {};
  const params = useMemo(
    () => ({ ...DEFAULTS, ...(data.payload?.params || {}) }),
    [data.payload?.params],
  );
  const parents = edges
    .filter((edge) => edge.target === id)
    .map((edge) => nodes.find((node) => node.id === edge.source));
  const dataset = parents.find((node) => node?.type === 'yolo-dataset');
  const train = parents.find((node) => node?.type === 'yolo-train');
  const datasetReady = typeof dataset?.data?.payload?.dataset_yaml === 'string';
  const modelReady = typeof train?.data?.payload?.best_model_path === 'string';
  const border = selected
    ? 'border-amber-300 ring-2 ring-amber-400/30'
    : data.status === 'fault'
      ? 'border-red-500'
      : 'border-amber-500';

  const setParam = useCallback((key: string, value: number) => {
    setNodes((current) => current.map((node) => node.id === id ? {
      ...node,
      data: {
        ...node.data,
        status: 'idle',
        description: 'Ready to evaluate',
        payload: {
          ...(node.data?.payload || {}),
          params: { ...DEFAULTS, ...(node.data?.payload?.params || {}), [key]: value },
          evaluation_result: undefined,
          json: undefined,
          output: undefined,
        },
      },
    } : node));
  }, [id, setNodes]);

  return (
    <div className={`w-[26rem] max-w-[calc(100vw-3rem)] overflow-visible rounded-xl border-2 bg-gray-800 text-gray-200 shadow-2xl ${border}`}>
      <Handle type="target" position={Position.Left} id="dataset" style={{ top: '31%' }} className="h-3 w-3 border-2 border-gray-400 bg-white" />
      <Handle type="target" position={Position.Left} id="model" style={{ top: '42%' }} className="h-3 w-3 border-2 border-gray-400 bg-white" />
      <Handle type="source" position={Position.Right} id="metric" className="h-3 w-3 border-2 border-gray-400 bg-white" />

      <div className="flex items-center justify-between rounded-t-lg bg-gray-700 px-3 py-2">
        <strong className="text-amber-300">Detection Evaluation</strong>
        <button
          type="button"
          className={`nodrag rounded px-2 py-1 text-xs font-semibold text-white ${isRunning ? 'cursor-wait bg-yellow-600' : 'bg-amber-600 hover:bg-amber-500'}`}
          disabled={isRunning}
          onClick={() => data.onRunNode?.(id)}
        >
          {isRunning ? 'Running…' : '▶ Run'}
        </button>
      </div>

      <div className="space-y-3 p-3">
        <div className="space-y-1 rounded border border-dashed border-amber-700 bg-gray-900/70 p-2 text-[10px]">
          <p className={datasetReady ? 'text-emerald-300' : 'text-gray-400'}>Dataset: {datasetReady ? 'ready' : 'connect a built YOLO Dataset Builder'}</p>
          <p className={modelReady ? 'text-emerald-300' : 'text-gray-400'}>Model: {modelReady ? 'ready' : 'connect a completed YOLO Train'}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[10px] text-gray-400">Confidence
            <input className="nodrag nowheel mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-gray-100 outline-none focus:border-amber-400" type="number" min="0" max="1" step="0.05" value={params.confidence_threshold} onKeyDown={(event) => event.stopPropagation()} onChange={(event) => setParam('confidence_threshold', Number(event.target.value))} />
          </label>
          <label className="block text-[10px] text-gray-400">Match IoU
            <input className="nodrag nowheel mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-gray-100 outline-none focus:border-amber-400" type="number" min="0.01" max="1" step="0.05" value={params.iou_threshold} onKeyDown={(event) => event.stopPropagation()} onChange={(event) => setParam('iou_threshold', Number(event.target.value))} />
          </label>
          <label className="block text-[10px] text-gray-400">NMS IoU
            <input className="nodrag nowheel mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-gray-100 outline-none focus:border-amber-400" type="number" min="0.01" max="1" step="0.05" value={params.nms_iou_threshold} onKeyDown={(event) => event.stopPropagation()} onChange={(event) => setParam('nms_iou_threshold', Number(event.target.value))} />
          </label>
          <label className="block text-[10px] text-gray-400">Image size
            <input className="nodrag nowheel mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-gray-100 outline-none focus:border-amber-400" type="number" min="32" step="32" value={params.image_size} onKeyDown={(event) => event.stopPropagation()} onChange={(event) => setParam('image_size', Number(event.target.value))} />
          </label>
        </div>

        {data.status === 'success' && result && <>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Detection Rate" value={percent(metrics.detection_rate)} />
            <Metric label="False Detection Rate" value={percent(metrics.false_detection_rate)} />
            <Metric label="Precision" value={percent(metrics.precision)} />
            <Metric label="False positives / image" value={number(metrics.false_positives_per_image, 2)} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded bg-emerald-500/15 p-2 text-emerald-300">TP <strong className="block text-sm">{number(metrics.tp)}</strong></div>
            <div className="rounded bg-red-500/15 p-2 text-red-300">FP <strong className="block text-sm">{number(metrics.fp)}</strong></div>
            <div className="rounded bg-amber-500/15 p-2 text-amber-200">FN <strong className="block text-sm">{number(metrics.fn)}</strong></div>
          </div>
          <div className="overflow-x-auto rounded border border-gray-700">
            <table className="w-full min-w-[22rem] text-center text-[10px]">
              <thead className="bg-gray-900 text-gray-400"><tr><th className="px-2 py-1 text-left">Class</th><th>Rate</th><th>Precision</th><th>TP</th><th>FP</th><th>FN</th></tr></thead>
              <tbody>{Array.isArray(result.per_class) && result.per_class.map((row: any) => <tr key={row.class_id} className="border-t border-gray-700"><th className="px-2 py-1 text-left font-medium text-gray-300">{row.class_name || row.class_id}</th><td>{percent(row.detection_rate)}</td><td>{percent(row.precision)}</td><td className="text-emerald-300">{number(row.tp)}</td><td className="text-red-300">{number(row.fp)}</td><td className="text-amber-200">{number(row.fn)}</td></tr>)}</tbody>
            </table>
          </div>
        </>}

        {data.status !== 'success' && <p className={`text-xs ${data.status === 'fault' ? 'text-red-400' : 'text-gray-400'}`}>{data.description || 'Connect the completed Dataset Builder and YOLO Train nodes, then run evaluation.'}</p>}
      </div>

      <div className="border-t border-gray-700 px-3 py-2 text-[10px] text-gray-500">Detection Rate = TP / (TP + FN) · False Detection Rate = FP / (TP + FP)</div>
    </div>
  );
});

export default DetectionEvaluationNode;
