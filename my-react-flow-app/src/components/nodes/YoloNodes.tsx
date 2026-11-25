import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Handle, Position, type NodeProps, useEdges, useNodes, useReactFlow } from 'reactflow';
import type { CustomNodeData } from '../../types';
import { abs, getYOLOModels } from '../../lib/api';
import { resolveYoloModel } from '../../lib/yoloModel';
import { compactPath } from '../../lib/compactPath';
import { NODE_DEFAULTS } from '../../lib/nodeDefaults';
import Modal from '../common/Modal';
import { SettingsSlidersIcon } from './SettingsSlidersIcon';
import { useNodeStatus } from '../../hooks/useNodeStatus';


type Mode = 'train' | 'detect' | 'gradcam';

const CONFIG = {
  train: {
    title: 'YOLO Train', hint: 'Configure a dataset YAML and train',
    text: 'text-cyan-400', border: 'border-cyan-500', button: 'bg-cyan-600 hover:bg-cyan-700',
  },
  detect: {
    title: 'YOLO Detect / Test', hint: 'Connect an image and run inference',
    text: 'text-cyan-400', border: 'border-cyan-500', button: 'bg-cyan-600 hover:bg-cyan-700',
  },
  gradcam: {
    title: 'YOLO Grad-CAM', hint: 'Explain detections with a heatmap',
    text: 'text-cyan-400', border: 'border-cyan-500', button: 'bg-cyan-600 hover:bg-cyan-700',
  },
} as const;

const DEFAULTS: Record<Mode, Record<string, any>> = {
  train: NODE_DEFAULTS['yolo-train'],
  detect: NODE_DEFAULTS['yolo-detect'],
  gradcam: NODE_DEFAULTS['yolo-gradcam'],
};

function Field({ label, value, type = 'text', onChange, readOnly = false, path = false }: {
  label: string;
  value: string | number;
  type?: string;
  onChange: (value: string | number) => void;
  readOnly?: boolean;
  path?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</span>
      <input
        className={`nodrag nowheel w-full rounded border border-gray-700 bg-gray-900 p-2 font-mono text-xs text-white outline-none ${readOnly ? 'cursor-not-allowed opacity-75' : 'focus:border-cyan-400'}`}
        type={type}
        value={path && !focused && typeof value === 'string' ? compactPath(value) : value}
        title={path ? String(value) : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        readOnly={readOnly}
        aria-readonly={readOnly}
        onKeyDown={(event) => event.stopPropagation()}
        onChange={(event) => onChange(type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)}
      />
    </label>
  );
}

function ModelSelect({ value, models, onChange, loading, error }: {
  value: string;
  models: { path: string; name: string }[];
  onChange: (value: string) => void;
  loading: boolean;
  error: string;
}) {
  const options = models.some((model) => model.path === value) || !value
    ? models
    : [{ path: value, name: `${value.split(/[\\/]/).pop()} (saved selection)` }, ...models];

  return <label className="block">
    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-400">Base model</span>
    <select
      className="nodrag nowheel w-full rounded border border-gray-700 bg-gray-900 p-2 font-mono text-xs text-white outline-none focus:border-cyan-400"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={loading && models.length === 0}
      title={value}
    >
      {!value && <option value="">{loading ? 'Loading models…' : 'Choose a model'}</option>}
      {options.map((model) => <option key={model.path} value={model.path}>{model.name} · {model.path}</option>)}
    </select>
    {error && <span className="mt-1 block text-[10px] text-amber-300">Could not load model list: {error}</span>}
    {!loading && !error && models.length === 0 && <span className="mt-1 block text-[10px] text-gray-500">No .pt models found in models/.</span>}
  </label>;
}

function YoloNode({ id, data, selected, mode }: NodeProps<CustomNodeData> & { mode: Mode }) {
  const rf = useReactFlow();
  const edges = useEdges();
  const nodes = useNodes<CustomNodeData>();
  const [availableModels, setAvailableModels] = useState<{ path: string; name: string }[]>([]);
  const [modelsLoading, setModelsLoading] = useState(mode === 'train');
  const [modelsError, setModelsError] = useState('');
  const [open, setOpen] = useState(false);
  const config = CONFIG[mode];
  const params = useMemo(
    () => ({ ...DEFAULTS[mode], ...(data?.payload?.params || data?.params || {}) }),
    [data?.params, data?.payload?.params, mode],
  );
  const isRunning = data.status === 'running' || data.status === 'start';
  const isSuccess = data.status === 'success';
  const isFault = data.status === 'fault';
  const { statusDot } = useNodeStatus(data);
  const isConnected = edges.some((edge) => edge.target === id);
  const model = resolveYoloModel(id, nodes, edges, params.model_path);

  useEffect(() => {
    if (mode !== 'train') return;
    const controller = new AbortController();
    getYOLOModels(controller.signal)
      .then((response) => setAvailableModels(response.models || []))
      .catch((error: any) => {
        if (error?.name !== 'AbortError') setModelsError(error?.message || 'Request failed');
      })
      .finally(() => {
        if (!controller.signal.aborted) setModelsLoading(false);
      });
    return () => controller.abort();
  }, [mode]);

  const [form, setForm] = useState<Record<string, any>>(params);
  useEffect(() => { if (!open) setForm(params); }, [params, open]);
  const setParam = useCallback((key: string, value: string | number) => setForm((f) => ({ ...f, [key]: value })), []);
  const saveParams = useCallback((values: Record<string, any>) => {
    rf.setNodes((nodes) => nodes.map((node) => {
      if (node.id !== id) return node;
      const current = { ...DEFAULTS[mode], ...(node.data?.payload?.params || node.data?.params || {}) };
      const next = { ...current, ...values };
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
  const trainingProgress = data?.payload?.training_progress;
  const imageUrl = mode === 'detect'
    ? data?.payload?.result_image_url || result.output_image_url
    : data?.payload?.result_image_url || result.overlay_url;
  const compactness = result.heatmap_compactness;
  const border = isFault ? 'border-red-500' : isRunning ? 'border-yellow-400' : selected ? 'border-cyan-400 ring-2 ring-cyan-500' : config.border;
  const handleClass = `h-3 w-3 border-2 border-gray-400 bg-white ${isFault && !isConnected ? '!h-4 !w-4 !border-red-300 !bg-red-500' : ''}`;

  return (
    <div className={`w-80 overflow-visible rounded-xl border-2 bg-gray-800 text-gray-200 shadow-2xl ${border}`}>
      <Handle type="target" position={Position.Left} className={handleClass} />
      <Handle type="source" position={Position.Right} className="h-3 w-3 border-2 border-gray-400 bg-white" />

      <div className="flex items-center justify-between rounded-t-lg bg-gray-700 px-3 py-2">
        <strong className={config.text}>{config.title}</strong>
        <div className="flex items-center gap-2">
          {mode === 'train' && isRunning ? (
            <button
              className="nodrag rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-500"
              disabled={Boolean(trainingProgress?.cancel_requested)}
              onClick={() => data?.onCancelNode?.(id)}
            >
              {trainingProgress?.cancel_requested ? 'Canceling…' : '■ Cancel'}
            </button>
          ) : (
            <button
              className={`nodrag rounded px-2 py-1 text-xs font-semibold text-white ${isRunning ? 'cursor-wait bg-yellow-600' : config.button}`}
              disabled={isRunning}
              onClick={() => data?.onRunNode?.(id)}
            >
              {isRunning ? 'Running…' : '▶ Run'}
            </button>
          )}
          <span className="relative inline-flex items-center group">
            <button
              type="button"
              aria-label={`${config.title} settings`}
              onClick={() => { setForm(params); setOpen(true); }}
              className="nodrag flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-white shadow ring-2 ring-gray-500/60 transition hover:bg-gray-100 focus-visible:outline-none active:scale-95"
            >
              <SettingsSlidersIcon className="h-3.5 w-3.5" />
            </button>
            <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs font-normal text-white opacity-0 shadow-lg ring-1 ring-black/20 transition-opacity duration-150 group-hover:opacity-100">Settings<span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-900" /></span>
          </span>
        </div>
      </div>

      <div className="space-y-2 p-3">
        {(mode === 'train' ? params.model_path : model.path) && (
          <div className="break-all text-xs text-gray-300" title={String(mode === 'train' ? params.model_path : model.path)}>
            Model: {compactPath(String(mode === 'train' ? params.model_path : model.path))}
          </div>
        )}
        {mode !== 'train' && model.source && (
          <p className="break-all text-[10px] text-cyan-300">
            From: {model.source.data.label || model.source.type} · {model.path ? 'connected output (read-only)' : 'run YOLO Train first'}
          </p>
        )}
        {mode !== 'train' && result.model_path && (
          <div className="break-all text-xs text-gray-400" title={result.model_path}>Last run model: {compactPath(result.model_path)}</div>
        )}
        {mode === 'train' && data.payload?.best_model_path && (
          <div className="break-all text-xs text-cyan-300" title={data.payload.best_model_path}>Output model: {compactPath(data.payload.best_model_path)}</div>
        )}

        {mode === 'train' && (isRunning || trainingProgress) && (
          <div className="rounded border border-cyan-400/40 bg-gray-900/70 p-2">
            <div className="mb-1 flex justify-between text-[10px] text-cyan-200">
              <span>{trainingProgress?.message || 'Preparing training…'}</span>
              <span>{Math.round(Number(trainingProgress?.progress || 0))}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-700">
              <div
                className="h-full rounded-full bg-cyan-500 transition-[width] duration-300"
                style={{ width: `${Math.min(100, Math.max(0, Number(trainingProgress?.progress || 0)))}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-gray-400">
              Epoch {Number(trainingProgress?.current_epoch || 0)} / {Number(trainingProgress?.total_epochs || params.epochs || 0)}
            </p>
          </div>
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

      <div className="grid grid-cols-4 border-t-2 border-gray-700 px-1 pb-2 pt-1.5 text-xs font-medium">
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-green-400">success</span><div className={statusDot(isSuccess, 'bg-green-500')} /></div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-yellow-400">fault</span><div className={statusDot(isFault, 'bg-yellow-500')} /></div>
      </div>

      <Modal open={open} title={`${config.title} Settings`} onClose={() => { setForm(params); setOpen(false); }}>
        <div className="space-y-3">
          {mode === 'train' && <Field path label="Dataset YAML" value={form.dataset_yaml} onChange={(v) => setParam('dataset_yaml', v)} />}
          {mode === 'train' ? <ModelSelect
            value={String(form.model_path || '')}
            models={availableModels}
            loading={modelsLoading}
            error={modelsError}
            onChange={(value) => setParam('model_path', value)}
          /> : <Field
            path
            label="Model weights"
            value={model.source ? (model.path || 'Waiting for YOLO Train…') : String(form.model_path ?? '')}
            readOnly={!!model.source}
            onChange={(v) => setParam('model_path', v)}
          />}

          {mode === 'train' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Epochs" type="number" value={form.epochs} onChange={(v) => setParam('epochs', v)} />
                <Field label="Image size" type="number" value={form.image_size} onChange={(v) => setParam('image_size', v)} />
                <Field label="Batch" type="number" value={form.batch} onChange={(v) => setParam('batch', v)} />
              </div>
              <p className="text-[10px] text-gray-500">Set Epochs to the number of training rounds you want.</p>
            </>
          )}

          {mode === 'detect' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Confidence" type="number" value={form.confidence} onChange={(v) => setParam('confidence', v)} />
                <Field label="IoU" type="number" value={form.iou} onChange={(v) => setParam('iou', v)} />
                <Field label="Image size" type="number" value={form.image_size} onChange={(v) => setParam('image_size', v)} />
              </div>
              <Field label="Class IDs (CSV, optional)" value={form.class_ids} onChange={(v) => setParam('class_ids', v)} />
            </>
          )}

          {mode === 'gradcam' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-400">CAM method</span>
                  <select
                    className="nodrag nowheel w-full rounded border border-gray-700 bg-gray-900 p-2 font-mono text-xs text-white outline-none focus:border-cyan-400"
                    value={form.method}
                    onChange={(event) => setParam('method', event.target.value)}
                  >
                    <option>GradCAM</option><option>GradCAMPlusPlus</option><option>EigenCAM</option><option>LayerCAM</option>
                  </select>
                </label>
                <Field label="Confidence" type="number" value={form.confidence} onChange={(v) => setParam('confidence', v)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Target layers (CSV)" value={form.target_layers} onChange={(v) => setParam('target_layers', v)} />
                <Field label="Class IDs (optional CSV)" value={form.target_class_ids} onChange={(v) => setParam('target_class_ids', v)} />
              </div>
            </>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t border-gray-700 pt-5">
          <button onClick={() => { setForm(params); setOpen(false); }} className="cursor-pointer rounded bg-gray-700 px-4 py-1.5 text-xs text-white transition hover:bg-gray-600">Cancel</button>
          <button onClick={() => { saveParams(form); setOpen(false); }} className={`cursor-pointer rounded px-4 py-1.5 text-xs font-bold text-white transition ${config.button}`}>Save</button>
        </div>
      </Modal>
    </div>
  );
}

export const YoloTrainNode = memo((props: NodeProps<CustomNodeData>) => <YoloNode {...props} mode="train" />);
export const YoloDetectNode = memo((props: NodeProps<CustomNodeData>) => <YoloNode {...props} mode="detect" />);
export const YoloGradCAMNode = memo((props: NodeProps<CustomNodeData>) => <YoloNode {...props} mode="gradcam" />);
