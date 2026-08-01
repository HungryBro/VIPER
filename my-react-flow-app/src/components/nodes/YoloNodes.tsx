import { memo, useCallback, useMemo } from 'react';
import { Handle, Position, type NodeProps, useEdges, useReactFlow } from 'reactflow';
import type { CustomNodeData } from '../../types';
import { abs } from '../../lib/api';


type Mode = 'train' | 'detect' | 'gradcam';

const CONFIG = {
  train: {
    title: 'YOLO Train', hint: 'Configure a dataset YAML and train',
    text: 'text-violet-400', border: 'border-violet-500', button: 'bg-violet-600 hover:bg-violet-500',
  },
  detect: {
    title: 'YOLO Detect / Test', hint: 'Connect an image and run inference',
    text: 'text-cyan-400', border: 'border-cyan-500', button: 'bg-cyan-600 hover:bg-cyan-500',
  },
  gradcam: {
    title: 'YOLO Grad-CAM', hint: 'Explain detections with a heatmap',
    text: 'text-rose-400', border: 'border-rose-500', button: 'bg-rose-600 hover:bg-rose-500',
  },
} as const;

const DEFAULTS: Record<Mode, Record<string, any>> = {
  train: {
    dataset_yaml: '',
    model_path: 'models/yolo11n.pt',
    epochs: 50,
    image_size: 640,
    batch: 16,
  },
  detect: {
    model_path: 'models/yolo11n.pt',
    confidence: 0.25,
    iou: 0.7,
    image_size: 640,
  },
  gradcam: {
    model_path: 'models/yolo11n.pt',
    method: 'GradCAM',
    confidence: 0.2,
    target_layers: '',
    target_class_ids: '',
  },
};

function Field({ label, value, type = 'text', onChange, readOnly = false }: {
  label: string;
  value: string | number;
  type?: string;
  onChange: (value: string | number) => void;
  readOnly?: boolean;
}) {
  return (
    <label className="block text-[10px] text-gray-400">
      <span className="mb-1 block">{label}</span>
      <input
        className={`nodrag nowheel w-full rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-gray-100 outline-none ${readOnly ? 'cursor-not-allowed opacity-75' : 'focus:border-cyan-400'}`}
        type={type}
        value={value}
        readOnly={readOnly}
        aria-readonly={readOnly}
        onKeyDown={(event) => event.stopPropagation()}
        onChange={(event) => onChange(type === 'number' ? Number(event.target.value) : event.target.value)}
      />
    </label>
  );
}

function YoloNode({ id, data, selected, mode }: NodeProps<CustomNodeData> & { mode: Mode }) {
  const rf = useReactFlow();
  const edges = useEdges();
  const config = CONFIG[mode];
  const params = useMemo(
    () => ({ ...DEFAULTS[mode], ...(data?.payload?.params || data?.params || {}) }),
    [data?.params, data?.payload?.params, mode],
  );
  const isRunning = data.status === 'running' || data.status === 'start';
  const isSuccess = data.status === 'success';
  const isFault = data.status === 'fault';
  const isConnected = edges.some((edge) => edge.target === id);

  const setParam = useCallback((key: string, value: string | number) => {
    rf.setNodes((nodes) => nodes.map((node) => {
      if (node.id !== id) return node;
      const current = { ...DEFAULTS[mode], ...(node.data?.payload?.params || node.data?.params || {}) };
      const next = { ...current, [key]: value };
      return {
        ...node,
        data: {
          ...node.data,
          params: next,
          payload: { ...(node.data?.payload || {}), params: next },
        },
      };
    }));
  }, [id, mode, rf]);

  const result = data?.payload?.json || {};
  const imageUrl = mode === 'detect'
    ? data?.payload?.result_image_url || result.output_image_url
    : data?.payload?.result_image_url || result.overlay_url;
  const compactness = result.heatmap_compactness;
  const border = isFault ? 'border-red-500' : isRunning ? 'border-yellow-400' : selected ? 'border-white ring-2 ring-white/30' : config.border;
  const handleClass = `h-3 w-3 border-2 border-gray-400 bg-white ${isFault && !isConnected ? '!h-4 !w-4 !border-red-300 !bg-red-500' : ''}`;

  return (
    <div className={`w-80 overflow-visible rounded-xl border-2 bg-gray-800 text-gray-200 shadow-2xl ${border}`}>
      <Handle type="target" position={Position.Left} className={handleClass} />
      <Handle type="source" position={Position.Right} className="h-3 w-3 border-2 border-gray-400 bg-white" />

      <div className="flex items-center justify-between rounded-t-lg bg-gray-700 px-3 py-2">
        <strong className={config.text}>{config.title}</strong>
        <button
          className={`nodrag rounded px-2 py-1 text-xs font-semibold text-white ${isRunning ? 'cursor-wait bg-yellow-600' : config.button}`}
          disabled={isRunning}
          onClick={() => data?.onRunNode?.(id)}
        >
          {isRunning ? 'Running…' : '▶ Run'}
        </button>
      </div>

      <div className="space-y-2 p-3">
        {mode === 'train' && <Field label="Dataset YAML" value={params.dataset_yaml} onChange={(v) => setParam('dataset_yaml', v)} />}
        <Field
          label={mode === 'train' ? 'Base model' : 'Model weights'}
          value={params.model_path}
          onChange={() => undefined}
          readOnly
        />

        {mode === 'train' && (
          <div className="grid grid-cols-3 gap-2">
            <Field label="Epochs" type="number" value={params.epochs} onChange={(v) => setParam('epochs', v)} />
            <Field label="Image size" type="number" value={params.image_size} onChange={(v) => setParam('image_size', v)} />
            <Field label="Batch" type="number" value={params.batch} onChange={(v) => setParam('batch', v)} />
          </div>
        )}

        {mode === 'detect' && (
          <div className="grid grid-cols-3 gap-2">
            <Field label="Confidence" type="number" value={params.confidence} onChange={(v) => setParam('confidence', v)} />
            <Field label="IoU" type="number" value={params.iou} onChange={(v) => setParam('iou', v)} />
            <Field label="Image size" type="number" value={params.image_size} onChange={(v) => setParam('image_size', v)} />
          </div>
        )}

        {mode === 'gradcam' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[10px] text-gray-400">
                <span className="mb-1 block">CAM method</span>
                <select
                  className="nodrag nowheel w-full rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs"
                  value={params.method}
                  onChange={(event) => setParam('method', event.target.value)}
                >
                  <option>GradCAM</option><option>GradCAMPlusPlus</option><option>EigenCAM</option><option>LayerCAM</option>
                </select>
              </label>
              <Field label="Confidence" type="number" value={params.confidence} onChange={(v) => setParam('confidence', v)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Target layers (CSV)" value={params.target_layers} onChange={(v) => setParam('target_layers', v)} />
              <Field label="Class IDs (optional CSV)" value={params.target_class_ids} onChange={(v) => setParam('target_class_ids', v)} />
            </div>
          </>
        )}

        {imageUrl && <img src={abs(imageUrl)} alt={config.title} className="max-h-52 w-full rounded border border-gray-700 object-contain" />}
        <p className="text-xs text-gray-400">
          {isSuccess
            ? mode === 'train'
              ? `Best model: ${String(result.best_model_path || 'training completed').split('/').pop()}`
              : mode === 'detect'
                ? `${result.detection_count ?? 0} detection(s)`
                : `Compactness ${Number(compactness ?? 0).toFixed(3)} · ${result.detection_count ?? 0} detection(s)`
            : data.description || config.hint}
        </p>
      </div>
    </div>
  );
}

export const YoloTrainNode = memo((props: NodeProps<CustomNodeData>) => <YoloNode {...props} mode="train" />);
export const YoloDetectNode = memo((props: NodeProps<CustomNodeData>) => <YoloNode {...props} mode="detect" />);
export const YoloGradCAMNode = memo((props: NodeProps<CustomNodeData>) => <YoloNode {...props} mode="gradcam" />);
