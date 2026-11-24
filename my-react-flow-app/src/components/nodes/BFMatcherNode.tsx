import { memo, useEffect, useMemo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps, useReactFlow, useEdges } from 'reactflow'; 
import type { CustomNodeData } from '../../types';
import Modal from '../common/Modal';
import { abs } from '../../lib/api';
import { useNodeStatus } from '../../hooks/useNodeStatus'; 
import { ParameterLoader } from '../ParameterLoader'; 
import { SettingsSlidersIcon } from './SettingsSlidersIcon';
import { NODE_DEFAULTS } from '../../lib/nodeDefaults';

// cross_check starts unset: the backend then picks it from the descriptor type.
const DEFAULT_PARAMS = { ...NODE_DEFAULTS.bfmatcher, cross_check: undefined as boolean | undefined };
type BFParams = typeof DEFAULT_PARAMS;

const ALLOWED_BF_KEYS = [
  'norm_type',
  'cross_check',
  'lowe_ratio',
  'ransac_thresh',
  'draw_mode'
];

const BFMatcherNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const rf = useReactFlow();
  const edges = useEdges();
  const [open, setOpen] = useState(false);
  
  const { isRunning, isSuccess, isFault, statusDot } = useNodeStatus(data);
  const isBusy = isRunning; 

  const isConnected1 = useMemo(() => edges.some(e => e.target === id && e.targetHandle === 'file1'), [edges, id]);
  const isConnected2 = useMemo(() => edges.some(e => e.target === id && e.targetHandle === 'file2'), [edges, id]);

  const params = useMemo(() => {
    const p = (data?.params || data?.payload?.params || {}) as Partial<BFParams>;
    return { ...DEFAULT_PARAMS, ...p };
  }, [data?.params, data?.payload?.params]);

  const [form, setForm] = useState<BFParams>(params);
  useEffect(() => setForm(params), [params]);

  const onClose = () => { setForm(params); setOpen(false); };
  
  const handleParamsLoaded = useCallback((loadedParams: any) => {
    
    if (loadedParams.index_params !== undefined || loadedParams.search_params !== undefined) {
        alert("❌ Invalid File!\n\nThis looks like a 'FLANN Matcher' configuration.\nYou cannot use it with BFMatcher.");
        return;
    }

    const cleanParams: Partial<BFParams> = {};
    let count = 0;

    ALLOWED_BF_KEYS.forEach((k) => {
        const key = k as keyof BFParams;
        const val = loadedParams[key];

        if (val !== undefined) { 
            if (key === 'norm_type') {
                if (['AUTO', 'L2', 'L1', 'HAMMING', 'HAMMING2'].includes(val)) {
                    cleanParams.norm_type = val;
                    count++;
                }
            } else if (key === 'draw_mode') {
                if (['good', 'inliers'].includes(val)) {
                    cleanParams.draw_mode = val;
                    count++;
                }
            } else if (key === 'cross_check') {
                cleanParams.cross_check = val === null ? undefined : Boolean(val);
                count++;
            } else {
                (cleanParams as any)[key] = Number(val);
                count++;
            }
        }
    });

    if (count === 0) {
        alert("No compatible parameters found for BFMatcher.");
        return;
    }

    setForm(prev => ({ ...prev, ...cleanParams }));
  }, []);

  const onSave = useCallback(() => {
    rf.setNodes(nds => nds.map(n => 
      n.id === id ? { 
        ...n, 
        data: { 
          ...n.data, 
          params: form, 
          payload: { ...(n.data?.payload || {}), params: form } 
        } 
      } : n
    ));
    setOpen(false);
  }, [rf, id, form]);

  const onRun = useCallback(() => {
    if (isBusy) return;
    data?.onRunNode?.(id);
  }, [data, id, isBusy]);

  const payload = data?.payload || {};
  const visUrl = (payload.vis_url || payload.result_image_url) as string | undefined;
  const respJson = payload.json as any | undefined;

  const getMeta = (imgKey: 'image1' | 'image2') => {
    if (!respJson) return null;
    const featDetails = respJson?.input_features_details?.[imgKey];
    const inputDetails = respJson?.inputs?.[imgKey];
    
    let w = featDetails?.width || inputDetails?.width;
    let h = featDetails?.height || inputDetails?.height;
    const shape = featDetails?.image_shape || inputDetails?.image_shape;
    if (!w && Array.isArray(shape)) { h = shape[0]; w = shape[1]; }

    const kps = featDetails?.num_keypoints || featDetails?.kps_count;
    return { size: (w && h) ? `${w}×${h}px` : null, kps: kps ?? null };
  };

  const metaA = getMeta('image1');
  const metaB = getMeta('image2');
  
  const rawSummary = (isSuccess && data?.description && !/(running|start)/i.test(data?.description)) 
      ? data.description 
      : respJson?.matching_statistics?.summary;

  const caption = rawSummary 
    ? rawSummary.replace(/\(BF\)/gi, '').trim() 
    : (visUrl ? 'Matches preview' : 'Connect feature nodes and run');

  let borderColor = 'border-orange-500';
  if (selected) borderColor = 'border-orange-400 ring-2 ring-orange-500';
  else if (isRunning) borderColor = 'border-yellow-500 ring-2 ring-yellow-500/50';

  const getHandleClass = (connected: boolean) => `w-2 h-2 rounded-full border-2 transition-all duration-300 ${
    isFault && !connected ? '!bg-red-500 !border-red-300 !w-4 !h-4 shadow-[0_0_10px_rgba(239,68,68,1)] ring-4 ring-red-500/30' : 'bg-white border-gray-500'
  }`;

  return (
    <div className={`bg-gray-800 border-2 rounded-xl shadow-2xl w-72 max-w-sm text-gray-200 overflow-visible transition-all duration-200 ${borderColor}`}>
      
      <Handle type="target" position={Position.Left} id="file1" className={getHandleClass(isConnected1)} style={{ top: '35%', transform: 'translateY(-50%)' }} />
      <Handle type="target" position={Position.Left} id="file2" className={getHandleClass(isConnected2)} style={{ top: '65%', transform: 'translateY(-50%)' }} />
      <Handle type="source" position={Position.Right} className={getHandleClass(true)} style={{ top: '50%', transform: 'translateY(-50%)' }} />

      <div className="bg-gray-700 text-orange-400 rounded-t-xl px-2 py-2 flex items-center justify-between font-bold">
        <div>BFMatcher</div>
        <div className="flex items-center gap-2">
          <button 
            onClick={onRun} 
            disabled={isBusy} 
            className={`px-2 py-1 rounded text-xs font-semibold transition-colors duration-200 text-white ${
              isRunning ? 'bg-yellow-600 cursor-wait opacity-80' : 'bg-orange-600 hover:bg-orange-700'
            }`}
          >
            {isRunning ? 'Running...' : '▶ Run'}
          </button>
          
          <span className="relative inline-flex items-center group">
            <button 
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
        {respJson && (
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div className={`rounded border p-2 transition-colors border-gray-600 bg-gray-800/50`}>
              <div className="text-gray-400 mb-1 truncate font-semibold border-b border-gray-700 pb-1">Input A</div>
              {metaA?.size || metaA?.kps ? (
                <div className="text-gray-200 font-mono text-[10px]">
                  <div>{metaA.size || '-'}</div><div className="text-green-300 mt-0.5">Kps: {metaA.kps || '-'}</div>
                </div>
              ) : <div className="text-gray-500">-</div>}
            </div>

            <div className={`rounded border p-2 transition-colors border-gray-600 bg-gray-800/50`}>
              <div className="text-gray-400 mb-1 truncate font-semibold border-b border-gray-700 pb-1">Input B</div>
              {metaB?.size || metaB?.kps ? (
                <div className="text-gray-200 font-mono text-[10px]">
                  <div>{metaB.size || '-'}</div><div className="text-green-300 mt-0.5">Kps: {metaB.kps || '-'}</div>
                </div>
              ) : <div className="text-gray-500">-</div>}
            </div>
          </div>
        )}

        {visUrl && <img src={abs(visUrl)} className="w-full rounded-lg border border-gray-700 shadow-md object-contain max-h-56" draggable={false} />}
        <p className="text-sm text-gray-300 break-words leading-relaxed">{caption}</p>
      </div>

      <div className="grid grid-cols-4 border-t-2 border-gray-700 px-1 pb-2 pt-1.5 text-xs font-medium">
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-green-400">success</span>
          <div className={statusDot(isSuccess, 'bg-green-500')} />
        </div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-yellow-400">fault</span><div className={statusDot(data?.status === 'fault', 'bg-yellow-500')} /></div>
      </div>

      <Modal open={open} title="BFMatcher Settings" onClose={onClose}>
        <div className="grid grid-cols-2 gap-4 text-xs text-gray-300">
          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Norm Type</label>
            <select 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-orange-400 font-mono outline-none focus:border-orange-500" 
              value={form.norm_type} 
              onChange={(e) => setForm(s => ({ ...s, norm_type: e.target.value as BFParams['norm_type'] }))}
            >
              <option value="AUTO">AUTO</option>
              <option value="L2">L2 (SIFT/SURF)</option>
              <option value="L1">L1 (SIFT/SURF)</option>
              <option value="HAMMING">HAMMING (ORB)</option>
              <option value="HAMMING2">HAMMING2 (ORB)</option>
            </select>
          </div>
          
          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Cross-check</label>
            <select 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-orange-400 font-mono outline-none focus:border-orange-500" 
              value={form.cross_check === undefined ? 'AUTO' : form.cross_check ? 'TRUE' : 'FALSE'} 
              onChange={(e) => { const v = e.target.value; setForm(s => ({ ...s, cross_check: v === 'AUTO' ? undefined : v === 'TRUE' })); }}
            >
              <option value="AUTO">AUTO (ORB=true)</option>
              <option value="TRUE">TRUE (BF.match)</option>
              <option value="FALSE">FALSE (KNN)</option>
            </select>
          </div>

          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Lowe's ratio</label>
            <input 
              type="number" step="0.01" min={0.1} max={1} 
              className={`nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-orange-400 font-mono outline-none focus:border-orange-500 ${form.cross_check === true ? 'opacity-50 cursor-not-allowed' : ''}`}
              value={form.lowe_ratio} 
              onChange={(e) => setForm(s => ({ ...s, lowe_ratio: Number(e.target.value) }))} 
              disabled={form.cross_check === true}
              onBlur={(e) => {
                  let val = Number(e.target.value);
                  if (val < 0.1) val = 0.1;
                  if (val > 1) val = 1;
                  setForm(s => ({ ...s, lowe_ratio: val }));
              }}
            />
          </div>

          <div>
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">RANSAC (px)</label>
            <input 
              type="number" step="0.1" min={0.1} 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-orange-400 font-mono outline-none focus:border-orange-500" 
              value={form.ransac_thresh} 
              onChange={(e) => setForm(s => ({ ...s, ransac_thresh: Number(e.target.value) }))}
              onBlur={(e) => {
                  let val = Number(e.target.value);
                  if (val < 0.1) val = 0.1;
                  setForm(s => ({ ...s, ransac_thresh: val }));
              }} 
            />
          </div>

          <div className="col-span-2">
            <label className="block mb-1 font-bold text-gray-400 uppercase text-[10px] tracking-wider">Draw Mode</label>
            <select 
              className="nodrag w-full bg-gray-900 rounded border border-gray-700 p-2 text-orange-400 font-mono outline-none focus:border-orange-500" 
              value={form.draw_mode} 
              onChange={(e) => setForm(s => ({ ...s, draw_mode: e.target.value as 'good' | 'inliers' }))}
            >
              <option value="good">Good matches</option>
              <option value="inliers">Inliers only</option>
            </select>
          </div>

          <div className="col-span-2 pt-2">
            <ParameterLoader onLoad={handleParamsLoaded} checkTool="BFMATCHER" />
          </div>

        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-gray-700 mt-4">
          <button onClick={onClose} className="px-4 py-1.5 rounded bg-gray-700 text-xs cursor-pointer hover:bg-gray-600 transition text-white">Cancel</button>
          <button onClick={onSave} className="px-4 py-1.5 rounded bg-orange-600 text-white text-xs font-bold cursor-pointer hover:bg-orange-700 transition">Save</button>
        </div>
      </Modal>
    </div>
  );
});

export default BFMatcherNode;