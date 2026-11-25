import { memo, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Handle, Position, type NodeProps, useEdges, useNodes, useReactFlow } from 'reactflow';
import type { CustomNodeData } from '../../types';
import { abs } from '../../lib/api';
import { useNodeStatus } from '../../hooks/useNodeStatus';

type Annotation = {
  class_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type DatasetImage = {
  name: string;
  path: string;
  url: string;
  width: number;
  height: number;
};

type Draft = { x: number; y: number; x2: number; y2: number };

const colour = (classId: number) => ['#22d3ee', '#f472b6', '#a3e635', '#fbbf24', '#a78bfa'][classId % 5];

function relativePoint(event: ReactPointerEvent<SVGSVGElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  };
}

const YoloDatasetNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const { setNodes } = useReactFlow();
  const nodes = useNodes<CustomNodeData>();
  const edges = useEdges();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [classId, setClassId] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const payload = data?.payload || {};
  const { isSuccess, isFault, statusDot } = useNodeStatus(data);
  const inputNode = edges
    .filter((edge) => edge.target === id)
    .map((edge) => nodes.find((node) => node.id === edge.source))
    .find((node) => node?.type === 'multi-image-input');
  const sourceImages = (Array.isArray(inputNode?.data?.payload?.dataset_images)
    ? inputNode.data.payload.dataset_images : []) as DatasetImage[];
  const annotationsByImage = (payload.annotations_by_image || {}) as Record<string, Annotation[]>;
  const images = sourceImages.map((image) => ({ ...image, annotations: annotationsByImage[image.path] || [] }));
  const classNames = useMemo(
    () => String(payload.class_names || '').split(',').map((name) => name.trim()).filter(Boolean),
    [payload.class_names],
  );
  const current = images[selectedIndex];

  const updatePayload = (changes: Record<string, unknown>) => {
    setNodes((nodes) => nodes.map((node) => node.id === id ? {
      ...node,
      data: { ...node.data, status: 'idle', payload: { ...(node.data.payload || {}), ...changes } },
    } : node));
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!current) return;
    if (!classNames.length) {
      setError('Add class names first, for example: cat, dog');
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = relativePoint(event);
    setDraft({ ...point, x2: point.x, y2: point.y });
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!draft) return;
    const point = relativePoint(event);
    setDraft({ ...draft, x2: point.x, y2: point.y });
  };

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!draft || !current) return;
    const point = relativePoint(event);
    const x = Math.min(draft.x, point.x);
    const y = Math.min(draft.y, point.y);
    const width = Math.abs(point.x - draft.x);
    const height = Math.abs(point.y - draft.y);
    setDraft(null);
    if (width < 0.01 || height < 0.01) return;

    updatePayload({
      annotations_by_image: {
        ...annotationsByImage,
        [current.path]: [...(annotationsByImage[current.path] || []), { class_id: Math.min(classId, classNames.length - 1), x, y, width, height }],
      },
    });
  };

  const undo = () => {
    if (!current?.annotations?.length) return;
    updatePayload({
      annotations_by_image: { ...annotationsByImage, [current.path]: current.annotations.slice(0, -1) },
    });
  };

  const activeBox = draft ? {
    x: Math.min(draft.x, draft.x2), y: Math.min(draft.y, draft.y2),
    width: Math.abs(draft.x2 - draft.x), height: Math.abs(draft.y2 - draft.y), class_id: classId,
  } : null;
  const annotationCount = images.reduce((count, image) => count + (image.annotations?.length || 0), 0);
  const border = selected ? 'border-cyan-400 ring-2 ring-cyan-500' : data.status === 'fault' ? 'border-red-500' : 'border-cyan-500';

  return (
    <div className={`w-[26rem] rounded-xl border-2 bg-gray-800 text-gray-200 shadow-2xl ${border}`}>
      <Handle type="target" position={Position.Left} id="images" className="h-3 w-3 border-2 border-gray-400 bg-white" />
      <Handle type="source" position={Position.Right} id="dataset" className="h-3 w-3 border-2 border-gray-400 bg-white" />
      <div className="flex items-center justify-between rounded-t-lg bg-gray-700 px-3 py-2">
        <strong className="text-cyan-400">YOLO Dataset Builder</strong>
        <button disabled={!images.length} className="nodrag rounded bg-cyan-600 px-2 py-1 text-xs font-semibold text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-gray-600" onClick={() => data?.onRunNode?.(id)}>
          Build dataset
        </button>
      </div>

      <div className="space-y-2 p-3">
        <label className="block text-[10px] text-gray-400">
          <span className="mb-1 block">Class names (comma separated)</span>
          <input
            className="nodrag nowheel w-full rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-gray-100 outline-none focus:border-cyan-400"
            value={String(payload.class_names || '')}
            placeholder="cat, dog"
            onKeyDown={(event) => event.stopPropagation()}
            onChange={(event) => { updatePayload({ class_names: event.target.value }); setClassId(0); }}
          />
        </label>

        {!images.length && <p className="rounded border border-dashed border-cyan-700 bg-gray-900 p-3 text-xs text-gray-400">Connect a Multi Image Input node here to annotate its images.</p>}

        {!!images.length && <>
          <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto rounded bg-gray-900 p-1">
            {images.map((image, index) => <button key={`${image.path}-${index}`} onClick={() => setSelectedIndex(index)} className={`nodrag rounded px-2 py-1 text-[10px] ${index === selectedIndex ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300'}`}>
              {index + 1}. {image.name}
            </button>)}
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <select className="nodrag rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs" value={classId} onChange={(event) => setClassId(Number(event.target.value))}>
              {classNames.length ? classNames.map((name, index) => <option key={`${name}-${index}`} value={index}>{index}: {name}</option>) : <option>Add class names first</option>}
            </select>
            <button onClick={undo} className="nodrag rounded bg-gray-700 px-2 py-1 text-xs hover:bg-gray-600" disabled={!current?.annotations?.length}>Undo box</button>
          </div>

          <div className="relative overflow-hidden rounded border border-gray-600 bg-gray-950">
            {current && <img src={abs(current.url) || current.url} alt={current.name} className="block h-auto w-full select-none" draggable={false} />}
            {current && <svg className="nodrag nowheel absolute inset-0 h-full w-full cursor-crosshair" viewBox="0 0 1 1" preserveAspectRatio="none" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
              {(current.annotations || []).map((box, index) => <g key={index}>
                <rect x={box.x} y={box.y} width={box.width} height={box.height} fill="transparent" stroke={colour(box.class_id)} strokeWidth="0.006" />
                <text x={box.x + 0.005} y={Math.max(0.03, box.y + 0.025)} fill={colour(box.class_id)} fontSize="0.035">{classNames[box.class_id] || box.class_id}</text>
              </g>)}
              {activeBox && <rect x={activeBox.x} y={activeBox.y} width={activeBox.width} height={activeBox.height} fill="transparent" stroke={colour(activeBox.class_id)} strokeDasharray="0.02" strokeWidth="0.006" />}
            </svg>}
          </div>
        </>}

        <p className="text-[10px] text-gray-400">{images.length} image(s) · {annotationCount} box(es). Select a class, then drag on an image to draw a box.</p>
        {payload.dataset_yaml && <p className="text-[10px] text-green-400">Dataset ready — connect this node to YOLO Train.</p>}
        {error && <p className="text-[10px] text-red-400">{error}</p>}
      </div>

      <div className="grid grid-cols-4 border-t-2 border-gray-700 px-1 pb-2 pt-1.5 text-xs font-medium">
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-red-400">start</span><div className={statusDot(data?.status === 'start', 'bg-red-500')} /></div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-cyan-400">running</span><div className={statusDot(data?.status === 'running', 'bg-cyan-400 animate-pulse')} /></div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-green-400">success</span><div className={statusDot(isSuccess, 'bg-green-500')} /></div>
        <div className="flex flex-col-reverse items-center gap-1 py-1"><span className="text-yellow-400">fault</span><div className={statusDot(isFault, 'bg-yellow-500')} /></div>
      </div>
    </div>
  );
});

export default YoloDatasetNode;
