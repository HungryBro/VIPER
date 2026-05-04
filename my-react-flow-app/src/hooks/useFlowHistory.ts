// my-react-flow-app/src/hooks/useFlowHistory.ts
import { useCallback, useEffect, useRef } from 'react'; 
import type { Node, Edge } from 'reactflow';
import type { CustomNodeData, NodeStatus } from '../types';

type RFNode = Node<CustomNodeData>;

type GraphSnapshot = {
  nodes: RFNode[];
  edges: Edge[];
};

export type UseFlowHistoryArgs = {
  nodes: RFNode[];
  edges: Edge[];
  setNodes: (updater: (prev: RFNode[]) => RFNode[]) => void;
  setEdges: (updater: (prev: Edge[]) => Edge[]) => void;
  isDraggingRef: { current: boolean };
};

const getCleanData = (data: any) => {
  const { 
    status, 
    onRunNode, 
    payload,
    json,
    output,
    json_data,
    message,
    error,
    meta,
    params_used,
    result_text,
    description, 
    
    ...rest 
  } = data || {};
  return rest;
};

const hasMeaningfulChange = (prevNodes: RFNode[], currNodes: RFNode[]) => {
  if (prevNodes.length !== currNodes.length) return true;

  const prevMap = new Map(prevNodes.map(n => [n.id, n]));

  for (const curr of currNodes) {
    const prev = prevMap.get(curr.id);
    if (!prev) return true; 

    if (prev.position.x !== curr.position.x || prev.position.y !== curr.position.y) {
      return true;
    }
    
    if (JSON.stringify(getCleanData(prev.data)) !== JSON.stringify(getCleanData(curr.data))) {
      return true;
    }
  }

  return false;
};

const hasEdgeChange = (prevEdges: Edge[], currEdges: Edge[]) => {
  if (prevEdges.length !== currEdges.length) return true;
  return JSON.stringify(prevEdges) !== JSON.stringify(currEdges);
};


export function useFlowHistory({
  nodes,
  edges,
  setNodes,
  setEdges,
  isDraggingRef,
}: UseFlowHistoryArgs) {

  const nodesRef = useRef<RFNode[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  const historyRef = useRef<GraphSnapshot[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const isApplyingHistoryRef = useRef(false);
  
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const makeSnapshot = useCallback((): GraphSnapshot => {
    return {
      nodes: nodesRef.current.map((n) => ({
        ...n,
        data: {
          ...(n.data || {}),
          status: 'idle' as NodeStatus, 
        },
      })),
      edges: edgesRef.current.map((e) => ({ ...e })),
    };
  }, []);

  const pushSnapshot = useCallback((snap: GraphSnapshot) => {
    const hist = historyRef.current;
    const idx = historyIndexRef.current;
    const trimmed = hist.slice(0, idx + 1);
    
    trimmed.push({
      nodes: snap.nodes.map(n => ({...n})), 
      edges: snap.edges.map(e => ({...e}))
    });

    historyRef.current = trimmed;
    historyIndexRef.current = trimmed.length - 1;
  }, []);

  const applySnapshot = useCallback(
    (snap: GraphSnapshot) => {
      isApplyingHistoryRef.current = true;

      setNodes((currentNodes) => {
        const currentMap = new Map(currentNodes.map((n) => [n.id, n]));
        
        return snap.nodes.map((snapNode) => {
          const current = currentMap.get(snapNode.id);
          const snapData = (snapNode.data || {}) as CustomNodeData;
          
          const currentStatus = current ? (current.data?.status || 'idle') : 'idle';
          
          const curD = (current?.data || {}) as CustomNodeData;

          return {
            ...snapNode,
            data: {
              ...snapData, 
              
              status: currentStatus, 
              
              payload: curD.payload !== undefined ? curD.payload : snapData.payload,
              json: curD.json !== undefined ? curD.json : snapData.json,
              output: curD.output !== undefined ? curD.output : snapData.output,
              
              message: curD.message !== undefined ? curD.message : snapData.message,
              error: curD.error !== undefined ? curD.error : snapData.error,
              meta: curD.meta !== undefined ? curD.meta : snapData.meta,
              params_used: curD.params_used !== undefined ? curD.params_used : snapData.params_used,
              result_text: curD.result_text !== undefined ? curD.result_text : snapData.result_text,
              
              description: curD.description !== undefined ? curD.description : snapData.description,
            },
          };
        });
      });

      setEdges(() => snap.edges.map((e) => ({ ...e })));

      setTimeout(() => {
        isApplyingHistoryRef.current = false;
      }, 50);
    },
    [setNodes, setEdges]
  );

  useEffect(() => {
    if (isApplyingHistoryRef.current) return;
    if (isDraggingRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      
      if (historyRef.current.length === 0) {
        pushSnapshot(makeSnapshot());
        return;
      }

      const lastSnap = historyRef.current[historyIndexRef.current];
      
      if (!lastSnap) return;

      const nodesChanged = hasMeaningfulChange(lastSnap.nodes, nodes);
      const edgesChanged = hasEdgeChange(lastSnap.edges, edges);

      if (nodesChanged || edgesChanged) {
        pushSnapshot(makeSnapshot());
      }

    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };

  }, [nodes, edges, isDraggingRef, makeSnapshot, pushSnapshot]); 

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    const targetIdx = historyIndexRef.current - 1;
    historyIndexRef.current = targetIdx;
    applySnapshot(historyRef.current[targetIdx]);
  }, [applySnapshot]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    const targetIdx = historyIndexRef.current + 1;
    historyIndexRef.current = targetIdx;
    applySnapshot(historyRef.current[targetIdx]);
  }, [applySnapshot]);

  return { undo, redo, isApplyingHistoryRef };
}