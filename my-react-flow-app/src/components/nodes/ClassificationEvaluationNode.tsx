import { memo, useCallback, useMemo, useState, type ChangeEvent } from 'react';
import { Handle, Position, type NodeProps, useEdges, useNodes, useReactFlow } from 'reactflow';

import type { CustomNodeData } from '../../types';


const EXAMPLE_INPUT = {
  class_names: ['negative', 'positive'],
  y_true: [0, 1, 1, 0],
  y_pred: [0, 1, 0, 0],
  y_scores: [0.05, 0.95, 0.40, 0.20],
};

const CURVE_COLOURS = ['#fbbf24', '#38bdf8', '#c084fc', '#4ade80', '#fb7185'];

function percent(value: unknown): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${(numeric * 100).toFixed(1)}%` : '—';
}

function rocPoints(points: any[]): string {
  return points.map((point) => {
    const fpr = Math.max(0, Math.min(1, Number(point?.false_positive_rate) || 0));
    const tpr = Math.max(0, Math.min(1, Number(point?.true_positive_rate) || 0));
    return `${10 + fpr * 80},${90 - tpr * 80}`;
  }).join(' ');
}

const ClassificationEvaluationNode = memo(({ id, data, selected }: NodeProps<CustomNodeData>) => {
  const { setNodes } = useReactFlow();
  const nodes = useNodes<CustomNodeData>();
  const edges = useEdges();
  const [uploadError, setUploadError] = useState('');
  const [showNormalized, setShowNormalized] = useState(false);
  const isRunning = data.status === 'start' || data.status === 'running';
  const isSuccess = data.status === 'success';
  const result = data.payload?.evaluation_result || data.payload?.json;
  const classNames = Array.isArray(result?.class_names) ? result.class_names : [];
  const matrix = showNormalized
    ? result?.normalized_confusion_matrix
    : result?.confusion_matrix;
  const curves = Array.isArray(result?.roc_curves) ? result.roc_curves : [];
  const inputName = data.payload?.evaluation_input_name as string | undefined;
  const upstreamNode = edges
    .filter((edge) => edge.target === id)
    .map((edge) => nodes.find((node) => node.id === edge.source))
    .find((node) => {
      const payload = node?.data?.payload || {};
      return [payload.classification_input, payload.evaluation_input, payload.json, payload.output, payload]
        .some((candidate) => candidate && typeof candidate === 'object' && !Array.isArray(candidate)
          && Array.isArray(candidate.y_true) && Array.isArray(candidate.y_pred));
    });
  const upstreamName = upstreamNode?.data?.label || upstreamNode?.type;
  const borderClass = selected
    ? 'border-amber-300 ring-2 ring-amber-400/30'
    : data.status === 'fault'
      ? 'border-red-500'
      : 'border-amber-500';

  const updateInput = useCallback((input: Record<string, unknown>, name: string) => {
    setNodes((nodes) => nodes.map((node) => node.id === id ? {
      ...node,
      data: {
        ...node.data,
        status: 'idle',
        description: 'Ready to evaluate',
        payload: {
          ...(node.data?.payload || {}),
          evaluation_input: input,
          evaluation_input_name: name,
          evaluation_input_source: undefined,
          evaluation_result: undefined,
          json: undefined,
          output: undefined,
        },
      },
    } : node));
  }, [id, setNodes]);

  const onChooseFile = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('The JSON root must be an object.');
        }
        updateInput(parsed, file.name);
        setUploadError('');
      } catch (error: any) {
        setUploadError(error?.message || 'Could not read this JSON file.');
      }
    };
    reader.onerror = () => setUploadError('Could not read this JSON file.');
    reader.readAsText(file);
  }, [updateInput]);

  const summary = useMemo(() => [
    ['Accuracy', percent(result?.metrics?.accuracy)],
    ['Macro F1', percent(result?.metrics?.macro_f1_score)],
    ['Macro AUC', Number.isFinite(Number(result?.macro_auc)) ? Number(result.macro_auc).toFixed(3) : '—'],
  ], [result]);

  return (
    <div className={`w-[26rem] max-w-[calc(100vw-3rem)] overflow-visible rounded-xl border-2 bg-gray-800 text-gray-200 shadow-2xl ${borderClass}`}>
      <Handle type="target" position={Position.Left} id="classification-input" style={{ top: '36%' }} className="h-3 w-3 border-2 border-gray-400 bg-white" />
      <Handle type="source" position={Position.Right} id="metric" className="h-3 w-3 border-2 border-gray-400 bg-white" />

      <div className="flex items-center justify-between rounded-t-lg bg-gray-700 px-3 py-2">
        <strong className="text-amber-300">Classification Evaluation</strong>
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
        <div className="rounded border border-dashed border-amber-700 bg-gray-900/70 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="nodrag cursor-pointer rounded bg-slate-700 px-2 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-600">
              Choose JSON
              <input className="hidden" type="file" accept="application/json,.json" onChange={onChooseFile} />
            </label>
            <button
              type="button"
              className="nodrag rounded border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
              onClick={() => { updateInput(EXAMPLE_INPUT, 'Example classification data'); setUploadError(''); }}
            >
              Load example
            </button>
            <span className="min-w-0 flex-1 truncate text-[10px] text-gray-400">
              {upstreamName ? `Connected: ${upstreamName}` : inputName || 'Upload y_true, y_pred, y_scores'}
            </span>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-gray-400">
            {upstreamName
              ? 'Connected JSON will be used first when running. It must contain y_true and y_pred.'
              : <>ROC needs <code>y_scores</code>; binary scores are for class ID 1, while multiclass scores need one value per class.</>}
          </p>
          {uploadError && <p className="mt-1 text-[10px] text-red-400">{uploadError}</p>}
        </div>

        {isSuccess && result && <>
          <div className="grid grid-cols-3 gap-2">
            {summary.map(([label, value]) => <div key={label} className="rounded bg-gray-900 p-2 text-center">
              <p className="text-[9px] uppercase tracking-wide text-gray-500">{label}</p>
              <p className="mt-1 text-sm font-semibold text-amber-200">{value}</p>
            </div>)}
          </div>

          <section>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-semibold text-amber-200">Confusion Matrix</p>
              <label className="nodrag flex cursor-pointer items-center gap-1 text-[10px] text-gray-400">
                <input type="checkbox" checked={showNormalized} onChange={(event) => setShowNormalized(event.target.checked)} />
                Normalize
              </label>
            </div>
            <div className="overflow-x-auto rounded border border-gray-700">
              <table className="w-full min-w-[19rem] text-center text-[10px]">
                <thead className="bg-gray-900 text-gray-400">
                  <tr>
                    <th className="px-2 py-1 text-left">Actual / Pred.</th>
                    {classNames.map((name: string, index: number) => <th key={`${name}-${index}`} className="max-w-20 truncate px-2 py-1" title={name}>{name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(matrix) && matrix.map((row: any[], rowIndex: number) => <tr key={rowIndex} className="border-t border-gray-700">
                    <th className="max-w-24 truncate bg-gray-900/50 px-2 py-1 text-left font-medium text-gray-300" title={classNames[rowIndex]}>{classNames[rowIndex] || rowIndex}</th>
                    {Array.isArray(row) && row.map((value, columnIndex) => <td key={columnIndex} className={`px-2 py-1 ${rowIndex === columnIndex ? 'bg-emerald-500/15 text-emerald-300' : 'text-gray-300'}`}>
                      {showNormalized ? Number(value).toFixed(2) : value}
                    </td>)}
                  </tr>)}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <p className="mb-1 text-xs font-semibold text-amber-200">ROC Curve</p>
            {curves.length > 0 ? <div className="rounded border border-gray-700 bg-gray-900 p-2">
              <svg className="h-32 w-full" viewBox="0 0 100 100" role="img" aria-label="ROC curve chart">
                <path d="M10 10V90H90" fill="none" stroke="#64748b" strokeWidth="1" />
                <path d="M10 90L90 10" fill="none" stroke="#64748b" strokeWidth="0.8" strokeDasharray="3 3" />
                {curves.map((curve: any, index: number) => <polyline
                  key={curve.class_id ?? index}
                  points={rocPoints(Array.isArray(curve.points) ? curve.points : [])}
                  fill="none"
                  stroke={CURVE_COLOURS[index % CURVE_COLOURS.length]}
                  strokeWidth="2"
                />)}
                <text x="50" y="99" fill="#94a3b8" fontSize="6" textAnchor="middle">False positive rate</text>
                <text x="4" y="54" fill="#94a3b8" fontSize="6" textAnchor="middle" transform="rotate(-90 4 54)">True positive rate</text>
              </svg>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
                {curves.map((curve: any, index: number) => <span key={curve.class_id ?? index} style={{ color: CURVE_COLOURS[index % CURVE_COLOURS.length] }}>
                  {curve.class_name}: AUC {Number(curve.auc).toFixed(3)}
                </span>)}
              </div>
            </div> : <p className="rounded border border-dashed border-gray-700 p-2 text-[10px] text-gray-500">Add y_scores to show ROC Curve and AUC.</p>}
          </section>
        </>}

        {!isSuccess && <p className={`text-xs ${data.status === 'fault' ? 'text-red-400' : 'text-gray-400'}`}>{data.description || 'Connect Classification JSON, or choose a JSON file, then run evaluation.'}</p>}
      </div>

      <div className="border-t border-gray-700 px-3 py-2 text-[10px] text-gray-500">
        Output: evaluation metrics
      </div>
    </div>
  );
});

export default ClassificationEvaluationNode;
