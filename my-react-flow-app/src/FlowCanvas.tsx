// File: src/FlowCanvas.tsx
import React, { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import ReactFlow, {
  MiniMap, Controls, Background, useNodesState, useEdgesState,
  addEdge, ConnectionLineType, getNodesBounds, getViewportForBounds, useReactFlow,
  type Node as RFNode, type Edge, type Connection, BackgroundVariant, type Viewport
} from 'reactflow';
import 'reactflow/dist/style.css';

import { defaultEdgeOptions } from './lib/flowConfig';
import type { CustomNodeData, LogEntry, NodeStatus } from './types';

// ---------- Nodes ----------
import { nodeSpec } from './lib/nodeCatalog';
import { nodeRunner, nodeTypes } from './lib/nodeRegistry';
import { defaultParams } from './lib/nodeDefaults';
import { markStartThenRunning } from './lib/runners/utils';
import { cancelYOLOTrainJob } from './lib/api';

// ---------- Hooks / Utils ----------
import { useFlowHotkeys } from './hooks/useFlowHotkeys';
import { useFlowHistory } from './hooks/useFlowHistory';
import { useWorkflowFile } from './hooks/useWorkflowFile';
import { validateNodeInput, validateConnection } from './lib/validation';
import LogPanel from './components/LogPanel';
import { withResult } from './lib/nodeResult';

export interface FlowCanvasHandle {
  getSnapshot: () => { nodes: RFNode[]; edges: Edge[]; viewport: Viewport };
  /** Show these nodes and edges. `'fit'` fits them to the canvas once they have been measured. */
  restoreSnapshot: (nodes: RFNode[], edges: Edge[], viewport: Viewport | 'fit') => void;
  fitView: () => void;
  addNode: (nodeType: string) => void;
}

interface FlowCanvasProps {
  isRunning: boolean;
  onPipelineDone: () => void;
  onFlowChange?: (changes: { nodes: RFNode[]; edges: Edge[]; viewport: Viewport }) => void;
  currentTabName: string;
  /** false while LabPage is kept mounted but hidden behind another route: hotkeys are off, everything else keeps running. */
  active?: boolean;
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
  ({ isRunning, onPipelineDone, onFlowChange, currentTabName, active = true }, ref) => {

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
        const freshNodes = getNodes();
        const freshEdges = getEdges();

        // A node never opened in its settings dialog has no saved params; it
        // runs with the defaults the dialog shows.
        const savedParams = node.data.payload?.params ?? node.data.params ?? {};
        const nodeToRun = {
          ...node,
          data: { ...node.data, payload: { ...node.data.payload, params: { ...defaultParams(node.type), ...savedParams } } },
        };

        const run = nodeRunner(node.type);
        if (run) await run(nodeToRun, setNodes, freshNodes, freshEdges);
        else console.warn(`Unknown type: ${node.type}`);

        const downstreamIds = getDownstreamNodes(nodeId, freshEdges);
        if (downstreamIds.size > 0) {
          setNodes((nds) => nds.map((n) => {
            if (downstreamIds.has(n.id)) {
              const params = n.data.payload?.params;
              const note = nodeSpec(n.type)?.upstreamChangeNote;
              if (note) {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    status: 'idle',
                    description: note,
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
        if (err?.canceled) {
          addLog(`[${nodeName}] ⏹ Training canceled`, 'warning', nodeId);
          setNodes((nds) => nds.map((n) => (n.id === nodeId ? {
            ...n,
            data: { ...n.data, status: 'idle' as NodeStatus, description: 'Training canceled' },
          } : n)));
          return;
        }
        addLog(`[${nodeName}] 💥 Error: ${cleanErrorMessage(err.message)}`, 'error', nodeId);
        setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, status: 'fault' as NodeStatus } } : n)));
        setIncomingEdgesStatus(nodeId, 'error');
        throw err;
      }
    }, [setNodes, addLog, setIncomingEdgesStatus, getNodes, getEdges]);

    const cancelNodeById = useCallback(async (nodeId: string) => {
      const node = getNodes().find((candidate) => candidate.id === nodeId);
      const jobId = node?.data?.payload?.training_progress?.job_id;
      if (!jobId) {
        addLog('No active YOLO training job found.', 'warning', nodeId);
        return;
      }
      try {
        const job = await cancelYOLOTrainJob(jobId);
        isCanceledRef.current = true;
        setNodes((nds) => nds.map((candidate) => candidate.id === nodeId ? {
          ...candidate,
          data: {
            ...candidate.data,
            description: job.message || 'Canceling training…',
            payload: {
              ...(candidate.data.payload || {}),
              training_progress: {
                ...(candidate.data.payload?.training_progress || {}),
                ...job,
                cancel_requested: true,
              },
            },
          },
        } : candidate));
        addLog(`[${node.data.label || 'YOLO Train'}] ⏹ Cancel requested`, 'warning', nodeId);
      } catch (error: any) {
        addLog(`Could not cancel training: ${cleanErrorMessage(error?.message || '')}`, 'error', nodeId);
      }
    }, [addLog, getNodes, setNodes]);

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
        data: { label: nodeType.toUpperCase(), status: 'idle', onRunNode: (nodeId: string) => runNodeById(nodeId), onCancelNode: (nodeId: string) => cancelNodeById(nodeId) },
      }));
      addLog(`Added ${nodeType}`, 'info', id);
    }, [addLog, cancelNodeById, runNodeById, screenToFlowPosition, setNodes]);

    const fitWorkflowToCanvas = useCallback(() => {
      const isCompactMobile = document.querySelector('.viper-app')?.classList.contains('compact-mobile');
      const flowPane = document.querySelector('.react-flow');

      // Fit inside the visible canvas on every breakpoint. The sidebar overlay is
      // excluded from the fit area; the log panel sits below the canvas, outside .react-flow.
      if (flowPane instanceof HTMLElement && nodes.length > 0) {
        const paneRect = flowPane.getBoundingClientRect();
        const sidebarRect = document.querySelector('.viper-sidebar')?.getBoundingClientRect();

        let contentLeft = paneRect.left;
        const contentTop = paneRect.top;
        const contentRight = paneRect.right;
        const contentBottom = paneRect.bottom;

        const sidebarOverlapsPane = sidebarRect
          && sidebarRect.right > paneRect.left
          && sidebarRect.left < paneRect.right
          && sidebarRect.top < paneRect.bottom
          && sidebarRect.bottom > paneRect.top;

        if (sidebarOverlapsPane && sidebarRect.left <= paneRect.left + 1) {
          contentLeft = Math.min(paneRect.right, sidebarRect.right + 12);
        }

        const fitAreas = [{
          left: contentLeft,
          top: contentTop,
          right: contentRight,
          bottom: contentBottom,
        }];

        const nodeBounds = getNodesBounds(nodes);
        const minZoom = isCompactMobile ? 0.12 : 0.08;
        const maxZoom = isCompactMobile ? 2.5 : 5;
        const padding = isCompactMobile ? 0.06 : 0.1;
        const bestFit = fitAreas
          .map((area) => {
            const width = Math.max(1, area.right - area.left);
            const height = Math.max(1, area.bottom - area.top);
            return {
              area,
              viewport: getViewportForBounds(nodeBounds, width, height, minZoom, maxZoom, padding),
            };
          })
          .reduce((best, candidate) => (
            candidate.viewport.zoom > best.viewport.zoom ? candidate : best
          ));

        setViewport({
          ...bestFit.viewport,
          x: bestFit.viewport.x + (bestFit.area.left - paneRect.left),
          y: bestFit.viewport.y + (bestFit.area.top - paneRect.top),
        }, { duration: 300 });
        return;
      }

      fitView({
        padding: isCompactMobile ? 0.06 : 0.1,
        minZoom: isCompactMobile ? 0.12 : 0.08,
        maxZoom: isCompactMobile ? 2.5 : 5,
        duration: 300,
      });
    }, [fitView, nodes, setViewport]);

    useImperativeHandle(ref, () => ({
      getSnapshot: () => ({ nodes, edges, viewport: getViewport() }),
      restoreSnapshot: (newNodes, newEdges, newViewport) => {
        const nodesWithFunc = newNodes.map(withResult).map(n => ({
          ...n, data: { ...n.data, onRunNode: (id: string) => runNodeById(id), onCancelNode: (id: string) => cancelNodeById(id) }
        }));
        setNodes(nodesWithFunc);
        setEdges(newEdges);
        if (newViewport === 'fit') fitPendingRef.current = true;
        else setViewport(newViewport);
      },
      fitView: fitWorkflowToCanvas,
      addNode: addNodeFromLibrary,
    }), [addNodeFromLibrary, cancelNodeById, edges, fitWorkflowToCanvas, getViewport, runNodeById, setEdges, setNodes, setViewport, nodes]);

    // A restore with 'fit' waits until React Flow has measured every node:
    // fitting earlier would use the wrong bounds.
    const fitPendingRef = useRef(false);
    useEffect(() => {
      if (!fitPendingRef.current) return;
      if (nodes.some((n) => !n.width || !n.height)) return;
      fitPendingRef.current = false;
      fitWorkflowToCanvas();
    }, [nodes, fitWorkflowToCanvas]);

    useFlowHotkeys({ getPastePosition: () => lastMousePosRef.current, runNodeById, undo, redo, enabled: active });

    useEffect(() => {
      setNodes((nds) => {
        let changed = false;
        const updated = nds.map((n) => {
          if (n.data && typeof n.data.onRunNode === 'function' && typeof n.data.onCancelNode === 'function') return n;
          changed = true;
          return { ...n, data: { ...(n.data || {}), onRunNode: (id: string) => runNodeById(id), onCancelNode: (id: string) => cancelNodeById(id) } };
        });
        return changed ? updated : nds;
      });
    }, [cancelNodeById, nodes, runNodeById, setNodes]);


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

          const sortedNodes = allNodes.sort((a, b) => (nodeSpec(a.type)?.order ?? 100) - (nodeSpec(b.type)?.order ?? 100));

          for (const node of sortedNodes) {
            if (isCanceledRef.current) { addLog('Pipeline stopped.', 'warning'); break; }
            if (!node?.id || !node?.type) continue;

            const spec = nodeSpec(node.type);
            if (spec?.runsInPipeline === false) continue;

            try {
              await runNodeById(node.id);


              await new Promise(r => setTimeout(r, spec?.settleMs ?? 100));

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
        data: { label: type.toUpperCase(), status: 'idle', onRunNode: (id: string) => runNodeById(id), onCancelNode: (id: string) => cancelNodeById(id) },
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

        <div className="flex-1 relative min-h-0">
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
            // A1: React Flow's own Backspace delete listens on the whole document; turn it off while
            // the editor is hidden or a Lab dialog is open (active is false then), as useFlowHotkeys does.
            deleteKeyCode={active ? 'Backspace' : null}
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
