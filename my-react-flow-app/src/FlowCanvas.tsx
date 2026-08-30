// File: src/FlowCanvas.tsx
import React, { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import ReactFlow, {
  MiniMap, Controls, Background, useNodesState, useEdgesState,
  addEdge, ConnectionLineType, useReactFlow,
  type Node as RFNode, type Edge, type Connection, BackgroundVariant, type Viewport
} from 'reactflow';
import 'reactflow/dist/style.css';

import { nodeTypes, defaultEdgeOptions } from './lib/flowConfig';
import type { CustomNodeData, LogEntry, NodeStatus } from './types';

// ---------- Runners ----------
import { runFeature } from './lib/runners/features';
import { runQuality } from './lib/runners/quality';
import { runMatcher } from './lib/runners/matching';
import { runAlignment } from './lib/runners/alignment';
import { runOtsu, runSnakeRunner } from './lib/runners/classification';
import { runSaveImage, runSaveJson } from './lib/runners/saver';
import { markStartThenRunning } from './lib/runners/utils';
import { runEnhancement } from './lib/runners/enhancement';
import { runRestoration } from './lib/runners/restoration';
import { runSegmentation } from './lib/runners/segmentation';
import { runDetectionNode } from './lib/runners/detection';
import { runYOLODatasetNode } from './lib/runners/yoloDataset';
import { runClassificationEvaluationNode, runDetectionEvaluationNode } from './lib/runners/evaluation';

// ---------- Hooks / Utils ----------
import { useFlowHotkeys } from './hooks/useFlowHotkeys';
import { useFlowHistory } from './hooks/useFlowHistory';
import { useWorkflowFile } from './hooks/useWorkflowFile';
import { validateNodeInput, validateConnection } from './lib/validation';
import LogPanel from './components/LogPanel';

export interface FlowCanvasHandle {
  getSnapshot: () => { nodes: RFNode[]; edges: Edge[]; viewport: Viewport };
  restoreSnapshot: (nodes: RFNode[], edges: Edge[], viewport: Viewport) => void;
  fitView: () => void;
  addNode: (nodeType: string) => void;
}

interface FlowCanvasProps {
  isRunning: boolean;
  onPipelineDone: () => void;
  onFlowChange?: (changes: { nodes: RFNode[]; edges: Edge[]; viewport: Viewport }) => void;
  currentTabName: string;
}

const getId = () => `node_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

function cleanErrorMessage(rawMsg: string): string {
  if (!rawMsg) return 'Unknown Error';
  try {
    const parsed = JSON.parse(rawMsg.substring(rawMsg.indexOf('{')));
    if (parsed.detail) return parsed.detail;
  } catch {
    // Keep the original message when the response is not JSON.
  }
  return rawMsg.replace(/^HTTP \d+ [a-zA-Z ]+ - /, '').replace(/^Error: /, '').trim();
}

function getDownstreamNodes(sourceId: string, edges: Edge[]): Set<string> {
  const downstreamIds = new Set<string>();
  const queue = [sourceId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const outgoers = edges
      .filter((e) => e.source === currentId)
      .map((e) => e.target);

    outgoers.forEach((targetId) => {
      if (!downstreamIds.has(targetId)) {
        downstreamIds.add(targetId);
        queue.push(targetId);
      }
    });
  }
  return downstreamIds;
}

const FlowCanvas = forwardRef<FlowCanvasHandle, FlowCanvasProps>(
  ({ isRunning, onPipelineDone, onFlowChange, currentTabName }, ref) => {

    const { screenToFlowPosition, fitView, getViewport, setViewport, getNodes, getEdges } = useReactFlow();

    const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
    const onMouseMove = useCallback((event: React.MouseEvent) => {
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      lastMousePosRef.current = pos;
    }, [screenToFlowPosition]);

    const [nodes, setNodes, onNodesChange] = useNodesState<CustomNodeData>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);

    const isDraggingRef = useRef(false);
    const isCanceledRef = useRef(false);

    const isProcessingRef = useRef(false);

    useEffect(() => {
      if (!onFlowChange) return;
      const timer = setTimeout(() => {
        onFlowChange({ nodes, edges, viewport: getViewport() });
      }, 1000);
      return () => clearTimeout(timer);
    }, [nodes, edges, onFlowChange, getViewport]);

    const addLog = useCallback((message: string, type: LogEntry['type'] = 'info', nodeId?: string) => {
      setLogs((prev) => [...prev, {
        id: Date.now().toString() + Math.random(),
        timestamp: new Date().toLocaleTimeString(),
        type, message, nodeId,
      }]);
    }, []);

    const nodesRef = useRef(nodes);
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);

    const { undo, redo, isApplyingHistoryRef } = useFlowHistory({ nodes, edges, setNodes, setEdges, isDraggingRef });
    const { saveWorkflow, triggerLoadWorkflow, fileInputRef, handleFileChange } = useWorkflowFile({
      nodes, edges, setNodes, setEdges, isApplyingHistoryRef, flowName: currentTabName
    });

    const handleClearWorkflow = useCallback(() => {
      if (nodes.length === 0) return;
      setNodes([]); setEdges([]);
      addLog('Workflow cleared.', 'warning');
    }, [nodes, setNodes, setEdges, addLog]);

    const setIncomingEdgesStatus = useCallback((nodeId: string, status: 'default' | 'error') => {
      setEdges((eds) => eds.map((e) => e.target === nodeId ? {
        ...e, animated: status === 'error',
        style: { ...e.style, stroke: status === 'error' ? '#ef4444' : '#64748b', strokeWidth: status === 'error' ? 3 : 2 }
      } : e));
    }, [setEdges]);

    const onEdgesDelete = useCallback((deletedEdges: Edge[]) => {
      if (deletedEdges.length === 0) return;
      const targetNodeIds = new Set(deletedEdges.map((e) => e.target));

      setNodes((nds) => nds.map((node) => {
        if (targetNodeIds.has(node.id)) {
          const params = node.data.payload?.params;
          return {
            ...node,
            data: {
              ...node.data,
              status: 'idle',
              description: 'Connection removed',
              payload: { params }
            }
          };
        }
        return node;
      }));
      addLog('Connection removed. Target node reset.', 'info');
    }, [setNodes, addLog]);

    const runNodeById = useCallback(async (nodeId: string) => {
      const currentNodes = getNodes();
      const currentEdges = getEdges();

      const node = currentNodes.find((n) => n.id === nodeId);

      if (!node) {
        throw new Error(`Node ${nodeId} missing from store`);
      }
      if (!node.type) return;

      const nodeName = node.data.label || node.type.toUpperCase();

      setIncomingEdgesStatus(nodeId, 'default');
      const check = validateNodeInput(nodeId, currentNodes, currentEdges);
      if (!check.isValid) {
        const cleanMsg = cleanErrorMessage(check.message || '');
        addLog(`[${nodeName}] ❌ fault: ${cleanMsg}`, 'error', nodeId);
        setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, status: 'fault' as NodeStatus } } : n)));
        setIncomingEdgesStatus(nodeId, 'error');
        throw new Error(check.message);
      }

      addLog(`[${nodeName}] ⏳ Processing...`, 'info', nodeId);
      await markStartThenRunning(nodeId, node.type.toUpperCase(), setNodes);

      try {
        const typeKey = node.type.toLowerCase();
        const freshNodes = getNodes();
        const freshEdges = getEdges();

        switch (typeKey) {
          case 'image-input':
            if (!node.data.payload?.url) throw new Error("No image uploaded yet.");
            setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, status: 'success' as NodeStatus } } : n));
            await new Promise(r => setTimeout(r, 100));
            break;

          case 'multi-image-input':
            if (!node.data.payload?.dataset_images?.length) throw new Error('No images uploaded yet.');
            setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, status: 'success' as NodeStatus } } : n));
            break;

          case 'yolo-dataset': await runYOLODatasetNode(node as any, setNodes as any, freshNodes as any, freshEdges); break;

          case 'sift': case 'surf': case 'orb': await runFeature(node, setNodes, freshNodes, freshEdges); break;
          case 'brisque': case 'psnr': case 'ssim': await runQuality(node, setNodes, freshNodes, freshEdges); break;
          case 'bfmatcher': case 'flannmatcher': await runMatcher(node, setNodes, freshNodes, freshEdges); break;
          case 'homography-align': case 'affine-align': await runAlignment(node as any, setNodes as any, freshNodes, freshEdges); break;
          case 'otsu': await runOtsu(node as any, setNodes as any, freshNodes, freshEdges); break;
          case 'snake': await runSnakeRunner(node as any, setNodes as any, freshNodes, freshEdges); break;
          case 'classification-evaluation': await runClassificationEvaluationNode(node as any, setNodes as any, freshNodes as any, freshEdges, undefined); break;
          case 'detection-evaluation': await runDetectionEvaluationNode(node as any, setNodes as any, freshNodes as any, freshEdges, undefined); break;
          case 'yolo-train': case 'yolo-detect': case 'yolo-gradcam': await runDetectionNode(node, setNodes, freshNodes, freshEdges); break;
          case 'clahe': case 'msrcr': case 'zero': case 'zerodce': case 'zero-dce': case 'zero_dce': await runEnhancement(node as any, setNodes as any, freshNodes, freshEdges); break;
          case 'dcnn': case 'dncnn': case 'swinir': case 'real': case 'realesrgan': await runRestoration(node as any, setNodes as any, freshNodes, freshEdges); break;
          case 'deep': case 'deeplab': case 'mask': case 'maskrcnn': case 'unet': await runSegmentation(node as any, setNodes as any, freshNodes, freshEdges); break;
          case 'save-image': await runSaveImage(node as any, setNodes as any, freshNodes, freshEdges); break;
          case 'save-json': await runSaveJson(node as any, setNodes as any, freshNodes, freshEdges); break;
          default: console.warn(`Unknown type: ${node.type}`);
        }

        const downstreamIds = getDownstreamNodes(nodeId, freshEdges);
        if (downstreamIds.size > 0) {
          setNodes((nds) => nds.map((n) => {
            if (downstreamIds.has(n.id)) {
              const params = n.data.payload?.params;
              if (n.type === 'yolo-dataset') {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    status: 'idle',
                    description: 'Images updated — annotations ready to build.',
                    payload: { ...(n.data.payload || {}) },
                  },
                };
              }
              return {
                ...n,
                data: {
                  ...n.data,
                  status: 'idle',
                  description: 'Waiting for upstream...',
                  payload: {
                    params: params,
                  }
                }
              };
            }
            return n;
          }));
        }

        addLog(`[${nodeName}] ✅ Completed`, 'success', nodeId);
      } catch (err: any) {
        addLog(`[${nodeName}] 💥 Error: ${cleanErrorMessage(err.message)}`, 'error', nodeId);
        setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, status: 'fault' as NodeStatus } } : n)));
        setIncomingEdgesStatus(nodeId, 'error');
        throw err;
      }
    }, [setNodes, addLog, setIncomingEdgesStatus, getNodes, getEdges]);

    const addNodeFromLibrary = useCallback((nodeType: string) => {
      const id = getId();
      const position = screenToFlowPosition({
        x: window.innerWidth * 0.6,
        y: window.innerHeight * 0.52,
      });
      setNodes((nds) => nds.concat({
        id,
        type: nodeType,
        position,
        data: { label: nodeType.toUpperCase(), status: 'idle', onRunNode: (nodeId: string) => runNodeById(nodeId) },
      }));
      addLog(`Added ${nodeType}`, 'info', id);
    }, [addLog, runNodeById, screenToFlowPosition, setNodes]);

    const fitWorkflowToCanvas = useCallback(() => {
      window.requestAnimationFrame(() => fitView({ padding: 0.18, duration: 500 }));
    }, [fitView]);

    useImperativeHandle(ref, () => ({
      getSnapshot: () => ({ nodes, edges, viewport: getViewport() }),
      restoreSnapshot: (newNodes, newEdges, newViewport) => {
        if (isApplyingHistoryRef.current) (isApplyingHistoryRef.current as any) = true;
        const nodesWithFunc = newNodes.map(n => ({
          ...n, data: { ...n.data, onRunNode: (id: string) => runNodeById(id) }
        }));
        setNodes(nodesWithFunc);
        setEdges(newEdges);
        setTimeout(() => {
          setViewport(newViewport);
          if (isApplyingHistoryRef.current) (isApplyingHistoryRef.current as any) = false;
        }, 50);
      },
      fitView: fitWorkflowToCanvas,
      addNode: addNodeFromLibrary,
    }), [addNodeFromLibrary, edges, fitWorkflowToCanvas, getViewport, runNodeById, setEdges, setNodes, setViewport, nodes, isApplyingHistoryRef]);

    useFlowHotkeys({ getPastePosition: () => lastMousePosRef.current, runNodeById, undo, redo });

    useEffect(() => {
      setNodes((nds) => {
        let changed = false;
        const updated = nds.map((n) => {
          if (n.data && typeof n.data.onRunNode === 'function') return n;
          changed = true;
          return { ...n, data: { ...(n.data || {}), onRunNode: (id: string) => runNodeById(id) } };
        });
        return changed ? updated : nds;
      });
    }, [nodes, runNodeById, setNodes]);


    useEffect(() => {
      if (!isRunning) {
        isCanceledRef.current = true;
        isProcessingRef.current = false;
        return;
      }

      if (isProcessingRef.current) return;

      isProcessingRef.current = true;
      isCanceledRef.current = false;

      const runAllNodes = async () => {
        try {
          addLog('🚀 Pipeline Started', 'info');

          const allNodes = getNodes();

          if (!allNodes || allNodes.length === 0) {
            addLog('⚠️ No nodes found to run.', 'warning');
            return;
          }

          const executionPriority: Record<string, number> = {
            'image-input': 1, 'multi-image-input': 1, 'yolo-dataset': 2,
            'dcnn': 10, 'dncnn': 10, 'swinir': 10, 'real': 10, 'realesrgan': 10,
            'clahe': 20, 'msrcr': 20, 'zero': 20, 'zerodce': 20, 'zero_dce': 20,
            'otsu': 30, 'snake': 30,
            'yolo-train': 5, 'yolo-detect': 25, 'yolo-gradcam': 30,
            'deep': 35, 'deeplab': 35, 'unet': 35, 'mask': 35, 'maskrcnn': 35,
            'sift': 40, 'surf': 40, 'orb': 40,
            'bfmatcher': 50, 'flannmatcher': 50,
            'homography-align': 60, 'affine-align': 60, 
            'brisque': 90, 'psnr': 90, 'ssim': 90,
            'classification-evaluation': 90,
            'detection-evaluation': 90,
            'save-image': 99,
            'save-json': 99
          };

          const sortedNodes = allNodes.sort((a, b) => {
            return (executionPriority[a.type?.toLowerCase() || ''] || 100) - (executionPriority[b.type?.toLowerCase() || ''] || 100);
          });

          for (const node of sortedNodes) {
            if (isCanceledRef.current) { addLog('Pipeline stopped.', 'warning'); break; }
            if (!node?.id || !node?.type) continue;

            if (node.type.startsWith('save-')) continue;

            try {
              setNodes((nds) => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, status: 'running' as NodeStatus } } : n));

              await new Promise(r => setTimeout(r, 50));

              await runNodeById(node.id);


              const isHeavyNode = ['deep', 'deeplab', 'mask', 'maskrcnn', 'unet'].includes(node.type?.toLowerCase() || '');
              const delayTime = isHeavyNode ? 500 : 100;

              await new Promise(r => setTimeout(r, delayTime));

            } catch (error) {
              console.warn(`Node ${node.id} failed.`, error);
              isCanceledRef.current = true;
              break;
            }
          }

          if (!isCanceledRef.current) addLog('🏁 Pipeline Finished', 'success');

        } finally {
          isProcessingRef.current = false;
          onPipelineDone?.();
        }
      };

      setTimeout(() => runAllNodes(), 0);

      return () => { isProcessingRef.current = false; };
    }, [addLog, getNodes, isRunning, onPipelineDone, runNodeById, setNodes]);

    const onValidateConnection = useCallback((connection: Connection) => {
      return validateConnection(connection, nodes, edges);
    }, [nodes, edges]);

    const onConnect = useCallback((conn: Edge | Connection) => setEdges((eds) => addEdge(conn, eds)), [setEdges]);
    const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);
    const onDrop = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('application/reactflow');
      if (!type) return;
      const id = getId();
      setNodes((nds) => nds.concat({
        id, type, position: screenToFlowPosition({ x: e.clientX, y: e.clientY }),
        data: { label: type.toUpperCase(), status: 'idle', onRunNode: (id: string) => runNodeById(id) },
      }));
      addLog(`Added ${type}`, 'info', id);
    }, [screenToFlowPosition, setNodes, runNodeById, addLog]);

    return (
      <div className="relative flex-1 h-full flex flex-col">
        <div className="viper-canvas-actions absolute left-16 right-2 top-2 z-10 flex justify-end gap-1 sm:left-auto sm:gap-2">
          <button type="button" onClick={fitWorkflowToCanvas} title="Fit workflow to canvas" aria-label="Fit workflow to canvas" className="viper-fit-canvas-button flex min-h-9 min-w-9 touch-manipulation items-center justify-center rounded border border-slate-600 bg-slate-800/80 px-2 text-white shadow-sm hover:bg-slate-700 sm:px-3">
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" />
              <path d="m3 3 6 6M21 3l-6 6M3 21l6-6M21 21l-6-6" />
            </svg>
          </button>
          <button type="button" onClick={saveWorkflow} className="flex min-h-9 min-w-9 touch-manipulation items-center justify-center rounded border border-slate-600 bg-slate-800/80 px-2 text-[10px] shadow-sm hover:bg-slate-700 sm:px-3 sm:text-xs">💾 <span className="ml-1 hidden sm:inline">SAVE</span></button>
          <button type="button" onClick={triggerLoadWorkflow} className="flex min-h-9 min-w-9 touch-manipulation items-center justify-center rounded border border-slate-600 bg-slate-800/80 px-2 text-[10px] shadow-sm hover:bg-slate-700 sm:px-3 sm:text-xs">📂 <span className="ml-1 hidden sm:inline">LOAD</span></button>
          <button type="button" onClick={handleClearWorkflow} className="flex min-h-9 min-w-9 touch-manipulation items-center justify-center rounded border border-red-700 bg-red-900/80 px-2 text-[10px] shadow-sm hover:bg-red-700 sm:px-3 sm:text-xs">🗑️ <span className="ml-1 hidden sm:inline">CLEAR</span></button>
          <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleFileChange} />
        </div>

        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} onDrop={onDrop} onDragOver={onDragOver} onMouseMove={onMouseMove}
            nodeTypes={nodeTypes} defaultEdgeOptions={defaultEdgeOptions}
            connectionLineType={ConnectionLineType.SmoothStep}
            fitView minZoom={0.08} maxZoom={5}
            onNodeDragStart={() => (isDraggingRef.current = true)}
            onNodeDragStop={() => (isDraggingRef.current = false)}
            isValidConnection={onValidateConnection}
            onEdgesDelete={onEdgesDelete}
          >
            <MiniMap
              position="bottom-left"
              style={{
                background: 'rgba(15,23,42,0.9)',
                left: 50,
                bottom: -2
              }}
              maskColor="rgba(0,0,0,0.6)"
              nodeColor={(n) => n.data?.status === 'success' ? '#22c55e' : '#94a3b8'}
            />

            <Controls
              position="bottom-left"
              style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '22px' }}
            />

            <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="#334155" />
          </ReactFlow>
        </div>
        <LogPanel logs={logs} onClear={() => setLogs([])} />
      </div>
    );
  });

export default FlowCanvas;
