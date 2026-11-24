import { memo, useEffect, useMemo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useEdges } from 'reactflow'; 
import type { CustomNodeData } from '../../types';
import Modal from '../common/Modal';
import { abs } from '../../lib/api';
import { useNodeStatus } from '../../hooks/useNodeStatus'; 
import { ParameterLoader } from '../ParameterLoader'; 
import { SettingsSlidersIcon } from './SettingsSlidersIcon';
import { NODE_DEFAULTS } from '../../lib/nodeDefaults';

const DEFAULT_PARAMS = { ...NODE_DEFAULTS.clahe };

type Params = typeof DEFAULT_PARAMS;

const ALLOWED_CLAHE_KEYS = ['clipLimit', 'tileGridSize', 'tileGridSizeX', 'tileGridSizeY'];

const CLAHENode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const edges = useEdges(); 
  const [open, setOpen] = useState(false);

  const { isRunning, isSuccess, isFault, statusDot } = useNodeStatus(data);

  const params = useMemo(() => {
    const p = (data?.params || data?.payload?.params || {}) as Partial<Params>;
    return { ...DEFAULT_PARAMS, ...p };
  }, [data?.params, data?.payload?.params]);

  const [form, setForm] = useState<Params>(params);

  useEffect(() => {
    if (!open) setForm(params);
  }, [params, open]);

  const handleParamsLoaded = useCallback((loadedParams: any) => {
    const source = loadedParams.clahe_parameters_used || loadedParams;
    const cleanParams: Partial<Params> = {};
    let count = 0;

    ALLOWED_CLAHE_KEYS.forEach((k) => {
        const val = source[k];
        if (val !== undefined && val !== null) {
            if (k === 'tileGridSize' && Array.isArray(val) && val.length === 2) {
                cleanParams.tileGridSizeX = Number(val[0]);
                cleanParams.tileGridSizeY = Number(val[1]);
                count++;
            } 
            else if (k === 'clipLimit') {
                cleanParams.clipLimit = Number(val);
                count++;
            }
            else if (k === 'tileGridSizeX') {
                cleanParams.tileGridSizeX = Number(val);
                count++;
            }
            else if (k === 'tileGridSizeY') {
                cleanParams.tileGridSizeY = Number(val);
                count++;
            }
        }
    });

    if (count === 0) {
        alert("No compatible parameters found for CLAHE.");
        return;
    }

    setForm(prev => ({ ...prev, ...cleanParams }));
  }, []);

  const onSave = useCallback(() => {
    const cleanParams = {
      clipLimit: Math.max(0.1, Number(form.clipLimit)),
      tileGridSize: [Math.max(1, Math.floor(form.tileGridSizeX)), Math.max(1, Math.floor(form.tileGridSizeY))],
      tileGridSizeX: Math.max(1, Math.floor(form.tileGridSizeX)),
      tileGridSizeY: Math.max(1, Math.floor(form.tileGridSizeY))
    };

    rf.setNodes((nds) => nds.map((n) => 
      n.id === id 
        ? { 
            ...n, 
            data: { 
              ...n.data, 
              params: cleanParams, 
              payload: { ...(n.data?.payload || {}), params: cleanParams } 
            } 
          } 
        : n
    ));
    setOpen(false);
  }, [rf, id, form]);

  const handleRun = useCallback(() => {
    if (!isRunning) {
      data?.onRunNode?.(id);
    }
  }, [data, id, isRunning]);

  const isConnected = useMemo(() => edges.some(e => e.target === id), [edges, id]);

  const visUrl = data?.payload?.vis_url || data?.payload?.output_image;
  const json_data = data?.payload?.json_data || data?.payload?.json;

  const displaySize = useMemo(() => {
    const imgMeta = json_data?.image || {};
    const shape = imgMeta.enhanced_shape || imgMeta.original_shape || data?.payload?.image_shape;
    
    if (Array.isArray(shape) && shape.length >= 2) {
      const h = shape[0];
      const w = shape[1];
      return `${w} x ${h}`; 
    }
    return null;
  }, [json_data, data?.payload]);
  
  const displayUrl = visUrl ? `${abs(visUrl)}?t=${Date.now()}` : undefined;

  const caption = (isSuccess && data?.description)
    ? data.description
    : (displayUrl ? 'Enhancement complete' : 'Connect Image Input and run');

  let borderColor = 'border-indigo-500';
  if (selected) borderColor = 'border-indigo-400 ring-2 ring-indigo-500';
  else if (isRunning) borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50';

  const targetHandleClass = `w-2 h-2 rounded-full border-2 transition-all duration-300 ${
    isFault && !isConnected 
      ? '!bg-red-500 !border-red-300 !w-4 !h-4 shadow-[0_0_10px_rgba(239,68,68,1)] ring-4 ring-red-500/30' 
      : 'bg-white border-gray-500'
  }`;

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 text-gray-200 overflow-visible transition-all duration-200 ${borderColor}`}>
      <Handle type="target" position={Position.Left} className={targetHandleClass} style={{ top: '50%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} className="w-2 h-2 rounded-full border-2 bg-white border-gray-500" style={{ top: '50%', transform: 'translateY(-50%)' }} />

      <div className="bg-gray-700 text-indigo-400 rounded-t-xl px-2 py-2 flex items-center justify-between font-bold">
        <div>CLAHE</div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRun}
            disabled={isRunning}
            className={`px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white cursor-pointer ${
              isRunning ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {isRunning ? 'Running...' : '▶ Run'}
          </button>

          <span className="relative inline-flex items-center group">
            <button
              onClick={() => setOpen(true)}
              className="h-5 w-5 rounded-full bg-white flex items-center justify-center shadow ring-2 ring-gray-500/60 transition hover:bg-gray-100 focus-visible:outline-none"
            >
              <SettingsSlidersIcon className="h-3.5 w-3.5" />
            </button>
            <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg ring-1 ring-black/20 transition-opacity duration-150 group-hover:opacity-100 z-50 font-normal">
              Settings
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
            </span>
          </span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {displaySize && <div className="text-[10px] text-gray-400 font-semibold tracking-tight">Dimensions: {displaySize}</div>}
        {displayUrl && <img src={displayUrl} className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56" draggable={false} />}
        <p className="text-sm text-gray-300 break-words leading-relaxed">{caption}</p>
      </div>

      <div className="grid grid-cols-4 border-t-2 border-gray-700 px-1 pb-2 pt-1.5 text-xs font-medium">
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-green-400">success</span><div className={statusDot(isSuccess, 'bg-green-500')} /></div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-yellow-400">fault</span><div className={statusDot(isFault, 'bg-yellow-500')} /></div>
      </div>

      <Modal open={open} title="CLAHE Settings" onClose={() => setOpen(false)}>
        <div className="space-y-4 text-xs text-gray-300">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Clip Limit</label>
              <input 
                type="number" step="0.1" min="0.1"
                className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-white font-mono outline-none focus:border-indigo-500" 
                value={form.clipLimit} 
                onChange={(e) => setForm(s => ({ ...s, clipLimit: Number(e.target.value) }))} 
                onBlur={(e) => {
                    const val = Number(e.target.value);
                    if (val < 0.1) setForm(s => ({ ...s, clipLimit: 0.1 }));
                }}
              />
            </div>
            <div>
              <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Tile X</label>
              <input 
                type="number" min="1"
                className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-white font-mono outline-none focus:border-indigo-500" 
                value={form.tileGridSizeX} 
                onChange={(e) => setForm(s => ({ ...s, tileGridSizeX: Number(e.target.value) }))}
                onBlur={(e) => {
                    const val = Math.floor(Number(e.target.value));
                    setForm(s => ({ ...s, tileGridSizeX: Math.max(1, val) }));
                }}
              />
            </div>
            <div>
              <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Tile Y</label>
              <input 
                type="number" min="1"
                className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-white font-mono outline-none focus:border-indigo-500" 
                value={form.tileGridSizeY} 
                onChange={(e) => setForm(s => ({ ...s, tileGridSizeY: Number(e.target.value) }))} 
                onBlur={(e) => {
                    const val = Math.floor(Number(e.target.value));
                    setForm(s => ({ ...s, tileGridSizeY: Math.max(1, val) }));
                }}
              />
            </div>
          </div>
          
          <div className="pt-2">
            <ParameterLoader onLoad={handleParamsLoaded} checkTool="CLAHE" />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-700 mt-2">
            <button onClick={() => setOpen(false)} className="px-4 py-1.5 rounded bg-gray-700 text-xs cursor-pointer hover:bg-gray-600 transition text-white">Cancel</button>
            <button onClick={onSave} className="px-4 py-1.5 rounded bg-indigo-600 text-white text-xs font-bold cursor-pointer hover:bg-indigo-500 transition">Save</button>
          </div>
        </div>
      </Modal>
    </div>
  );
});

export default CLAHENode;