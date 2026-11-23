// src/hooks/useWorkflowFile.ts
import { useCallback, useRef } from 'react'; 
import { useReactFlow, type Node, type Edge } from 'reactflow';
import type { CustomNodeData, NodeStatus } from '../types';
import { withResult } from '../lib/nodeResult';

type RFNode = Node<CustomNodeData>;

export type UseWorkflowFileArgs = {
  nodes: RFNode[];
  edges: Edge[];
  setNodes: (updater: (prev: RFNode[]) => RFNode[]) => void;
  setEdges: (updater: (prev: Edge[]) => Edge[]) => void;

  isApplyingHistoryRef?: { current: boolean }; 
  flowName: string;
};

type SavedWorkflow = {
  version: number;
  timestamp?: string;
  nodes: RFNode[];
  edges: Edge[];
};

export function useWorkflowFile({
  nodes,
  edges,
  setNodes,
  setEdges,
  isApplyingHistoryRef,
  flowName,
}: UseWorkflowFileArgs) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  const { fitView } = useReactFlow();

  const saveWorkflow = useCallback(() => {
    const payload: SavedWorkflow = {
      version: 1,
      timestamp: new Date().toISOString(), 
      nodes,
      edges,
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const safeName = flowName
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_\u0E00-\u0E7F-]/g, '');

    const finalName = `${safeName || 'workflow'}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }, [nodes, edges, flowName]);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = reader.result;
          if (typeof text !== 'string') {
            throw new Error('Invalid file content');
          }

          const parsed = JSON.parse(text) as Partial<SavedWorkflow>;

          if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
            throw new Error('Invalid workflow JSON structure');
          }

          const loadedNodes: RFNode[] = parsed.nodes.map((n) => withResult({
            ...n,
            data: {
              ...(n.data || ({} as CustomNodeData)),
              status: 'idle' as NodeStatus,
            },
          }));

          const loadedEdges: Edge[] = parsed.edges.map((e) => ({ ...e }));

          if (isApplyingHistoryRef) {
            isApplyingHistoryRef.current = true;
          }

          setNodes(() => loadedNodes);
          setEdges(() => loadedEdges);

          setTimeout(() => {
            window.requestAnimationFrame(() => {
                fitView({ padding: 0.2, duration: 800 });
            });
            
            if (isApplyingHistoryRef) {
              isApplyingHistoryRef.current = false;
            }
          }, 50);

        } catch (err) {
          console.error('Failed to load workflow file:', err);
          alert('โหลด workflow ไม่ได้: ไฟล์ไม่ถูกต้องหรือเสียหาย');
        } finally {
          event.target.value = '';
        }
      };

      reader.onerror = () => {
        console.error('FileReader error:', reader.error);
        alert('เกิดข้อผิดพลาดในการอ่านไฟล์ workflow');
        event.target.value = '';
      };

      reader.readAsText(file);
    },
    [setNodes, setEdges, isApplyingHistoryRef, fitView]
  );

  const triggerLoadWorkflow = useCallback(() => {
    if (!fileInputRef.current) return;
    fileInputRef.current.click();
  }, []);

  return {
    saveWorkflow,
    triggerLoadWorkflow,
    fileInputRef,
    handleFileChange,
  };
}