import { memo, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useEdges } from 'reactflow'; 
import type { CustomNodeData } from '../../types';
import { abs } from '../../lib/api'; 
import Modal from '../common/Modal';
import { useNodeStatus } from '../../hooks/useNodeStatus';
import { ParameterLoader } from '../ParameterLoader'; 
import { SettingsSlidersIcon } from './SettingsSlidersIcon';
import { NODE_DEFAULTS } from '../../lib/nodeDefaults';

const stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation();

type Params = {
  gaussian_blur: boolean;
  blur_ksize: number;
  invert: boolean;
};

const DEFAULT_PARAMS: Params = { ...NODE_DEFAULTS.otsu } as Params;

const OtsuNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const edges = useEdges();

  const [open, setOpen] = useState(false);
  
  const { isRunning, isSuccess, isFault, statusDot } = useNodeStatus(data);

  const imgRef = useRef<HTMLImageElement>(null); 
  const [imgSize, setImgSize] = useState<{w: number, h: number} | null>(null);

  const isConnected = useMemo(() => edges.some((e) => e.target === id), [edges, id]);

  const savedParams = useMemo(() => {
    const p = (data?.params || data?.payload?.params || {}) as Partial<Params>;
    return { ...DEFAULT_PARAMS, ...p };
  }, [data?.params, data?.payload?.params]);

  const [form, setForm] = useState<Params>(savedParams);
  useEffect(() => setForm(savedParams), [savedParams]);

  const onRun = useCallback(() => {
    if (!isRunning) data?.onRunNode?.(id);
  }, [data, id, isRunning]);

  const onClose = () => { setForm(savedParams); setOpen(false); };
  
  const handleParamsLoaded = useCallback((loadedParams: any) => {
    const source = loadedParams.parameters || loadedParams;
    const cleanParams: Partial<Params> = {};
    let count = 0;

    if (source.blur !== undefined) { 
        cleanParams.gaussian_blur = Boolean(source.blur); count++; 
    } else if (source.gaussian_blur !== undefined) {
        cleanParams.gaussian_blur = Boolean(source.gaussian_blur); count++;
    }

    if (source.k !== undefined) { 
        cleanParams.blur_ksize = Number(source.k); count++; 
    } else if (source.blur_ksize !== undefined) {
        cleanParams.blur_ksize = Number(source.blur_ksize); count++;
    }

    if (source.inv !== undefined) { 
        cleanParams.invert = Boolean(source.inv); count++; 
    } else if (source.invert !== undefined) {
        cleanParams.invert = Boolean(source.invert); count++;
    }

    if (count === 0) {
        alert("No compatible parameters found for Otsu.");
        return;
    }

    setForm(prev => ({ ...prev, ...cleanParams }));
  }, []);

  const onSave = useCallback(() => {
    let k = Math.floor(form.blur_ksize);
    if (k < 1) k = 1;
    if (k % 2 === 0) k += 1; 

    const finalParams = { ...form, blur_ksize: k };

    rf.setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? { 
              ...n, 
              data: { 
                ...n.data, 
                params: finalParams, 
                payload: { ...(n.data?.payload || {}), params: finalParams } 
              } 
            }
          : n
      )
    );
    setOpen(false);
  }, [rf, id, form]);

  const resp = data?.payload?.json as any | undefined;
  const resultImage = data?.payload?.result_image_url || data?.payload?.preview_url || resp?.binary_url;
  
  const thr = resp?.threshold_value || resp?.threshold || resp?.output?.threshold_value || resp?.output?.threshold || data?.payload?.threshold_value;

  const rawUrl = resultImage;
  const displayImage = rawUrl ? `${abs(rawUrl)}?t=${Date.now()}` : undefined;

  const caption = (isSuccess || resultImage) 
    ? `Threshold = ${thr ?? '?'}` 
    : 'Connect Image Input and run';

  const onImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const img = e.currentTarget;
    const newWidth = img.naturalWidth;
    const newHeight = img.naturalHeight;
    
    if (imgSize === null || imgSize.w !== newWidth || imgSize.h !== newHeight) {
        setImgSize({ w: newWidth, h: newHeight });
    }
  }, [imgSize]); 

  let borderColor = 'border-pink-500';
  if (selected) {
    borderColor = 'border-pink-400 ring-2 ring-pink-500';
  } else if (isRunning) {
    borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50';
  }

  const targetHandleClass = `w-2 h-2 rounded-full border-2 transition-all duration-300 ${
    isFault && !isConnected
      ? '!bg-red-500 !border-red-300 !w-4 !h-4 shadow-[0_0_10px_rgba(239,68,68,1)] ring-4 ring-red-500/30'
      : 'bg-white border-gray-500'
  }`;
  const sourceHandleClass = 'w-2 h-2 rounded-full border-2 transition-all duration-300 bg-white border-gray-500';

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 text-gray-200 overflow-visible transition-all duration-200 ${borderColor}`}>
      <Handle type="target" position={Position.Left} className={targetHandleClass} style={{ top: '50%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} className={sourceHandleClass} style={{ top: '50%', transform: 'translateY(-50%)' }} />

      <div className="bg-gray-700 text-pink-400 rounded-t-xl px-2 py-2 flex items-center justify-between font-bold">
        <div>Otsu Threshold</div>
        <div className="flex items-center gap-2">
          <button 
            onClick={onRun} 
            disabled={isRunning} 
            className={`px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white ${
              isRunning ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-pink-600 hover:bg-pink-700'
            }`}
          >
            {isRunning ? 'Running...' : '▶ Run'}
          </button>
          
          <span className="relative inline-flex items-center group">
            <button 
              aria-label="Open Otsu settings" 
              onClick={() => setOpen(true)} 
              className="h-5 w-5 rounded-full bg-white flex items-center justify-center shadow ring-2 ring-gray-500/60 hover:ring-gray-500/80 transition focus:outline-none"
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
        {imgSize && (
            <div className="text-[10px] text-gray-400 font-semibold tracking-tight">
                Dimensions: {imgSize.w} x {imgSize.h}
            </div>
        )}

        {displayImage && (
          <img
            ref={imgRef}
            src={displayImage}
            alt="otsu"
            onLoad={onImgLoad} 
            className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56"
            draggable={false}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}

        <p className="text-sm text-gray-300">
          {caption}
        </p>
      </div>

      <div className="border-t-2 border-gray-700 p-2 text-sm font-medium">
        <div className="flex justify-between items-center py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-green-400">success</span>
           <div className={statusDot(isSuccess, 'bg-green-500')} />
        </div>
        <div className="flex justify-between items-center py-1"><span className="text-yellow-400">fault</span><div className={statusDot(data?.status === 'fault', 'bg-yellow-500')} /></div>
      </div>

      <Modal open={open} title="Otsu Settings" onClose={onClose}>
        <div className="space-y-4 text-xs text-gray-300">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.gaussian_blur} onKeyDown={stopPropagation} onChange={(e) => setForm((s: Params) => ({ ...s, gaussian_blur: e.target.checked }))} className="accent-pink-500" />
            Gaussian blur before threshold
          </label>

          <label className="block">
            <span className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Blur Kernel Size (odd)</span>
            <input 
              type="number" min={1} step={2} 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-pink-400 font-mono outline-none focus:border-pink-500" 
              value={form.blur_ksize} 
              onKeyDown={stopPropagation} 
              onChange={(e) => setForm((s: Params) => ({ ...s, blur_ksize: Number(e.target.value) }))}
              onBlur={(e) => {
                  let v = Math.floor(Number(e.target.value));
                  if (v < 1) v = 1;
                  if (v % 2 === 0) v += 1;
                  setForm((s: Params) => ({ ...s, blur_ksize: v }));
              }} 
            />
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.invert} onKeyDown={stopPropagation} onChange={(e) => setForm((s: Params) => ({ ...s, invert: e.target.checked }))} className="accent-pink-500" />
            Invert output
          </label>
          
          <div className="pt-2">
            <ParameterLoader onLoad={handleParamsLoaded} checkTool="OtsuThreshold" />
          </div>

          <div className="flex justify-end gap-2 pt-5 border-t border-gray-700 mt-4">
            <button onClick={onClose} className="px-4 py-1.5 rounded bg-gray-700 text-xs cursor-pointer hover:bg-gray-600 transition text-white">Cancel</button>
            <button onClick={onSave} className="px-4 py-1.5 rounded bg-pink-600 text-white text-xs font-bold cursor-pointer hover:bg-pink-700 transition">Save</button>
          </div>
        </div>
      </Modal>
    </div>
  );
});

export default memo(OtsuNode);