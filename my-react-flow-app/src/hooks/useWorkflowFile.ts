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

export type ParsedWorkflow = {
  /** ชื่อที่เก็บในไฟล์ (ถ้ามี) */
  name?: string;
  nodes: RFNode[];
  edges: Edge[];
};

/** ไฟล์ที่เปิดไม่ได้ ข้อความบอกสาเหตุให้ผู้ใช้ */
export class WorkflowFileError extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** แปลงและตรวจข้อความในไฟล์ workflow ใช้ร่วมกันทั้งตัวเลือกไฟล์บน canvas และแท็บนำเข้า */
export function parseWorkflowText(text: unknown): ParsedWorkflow {
  if (typeof text !== 'string') {
    throw new WorkflowFileError('อ่านเนื้อหาไฟล์ไม่ได้');
  }

  let parsed: Partial<SavedWorkflow> & { name?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new WorkflowFileError('ไฟล์ไม่ใช่ JSON ที่อ่านได้ (ไฟล์อาจเสียหายหรือไม่ครบ)');
  }

  if (!Array.isArray(parsed?.nodes) || !Array.isArray(parsed?.edges)) {
    throw new WorkflowFileError('ไม่ใช่ workflow ของ VIPER: ไม่มีรายการ nodes และ edges');
  }
  // โหนดที่ไม่มีตำแหน่งหรือชนิดทำให้ canvas พัง และจะค้างอยู่ในแท็บที่จำไว้
  const nodeOk = (n: unknown) => isRecord(n) && typeof n.id === 'string' && typeof n.type === 'string'
    && isRecord(n.position) && Number.isFinite(n.position.x) && Number.isFinite(n.position.y);
  const edgeOk = (e: unknown) => isRecord(e) && typeof e.source === 'string' && typeof e.target === 'string';
  if (!parsed.nodes.every(nodeOk) || !parsed.edges.every(edgeOk)) {
    throw new WorkflowFileError('ไม่ใช่ workflow ของ VIPER: ข้อมูลโหนดหรือเส้นเชื่อมไม่ครบ');
  }

  const nodes: RFNode[] = parsed.nodes.map((n) => withResult({
    ...n,
    data: {
      ...(n.data || ({} as CustomNodeData)),
      status: 'idle' as NodeStatus,
    },
  }));
  const edges: Edge[] = parsed.edges.map((e) => ({ ...e }));
  const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : undefined;

  return { name, nodes, edges };
}

export function readWorkflowFile(file: File): Promise<ParsedWorkflow> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseWorkflowText(reader.result));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => {
      console.error('FileReader error:', reader.error);
      reject(new WorkflowFileError('เกิดข้อผิดพลาดในการอ่านไฟล์ workflow'));
    };
    reader.readAsText(file);
  });
}

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

  /** แทนโหนดและเส้นเชื่อมของแท็บปัจจุบันด้วย workflow ที่อ่านจากไฟล์ แล้ว fit */
  const applyWorkflow = useCallback(
    (loadedNodes: RFNode[], loadedEdges: Edge[]) => {
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
    },
    [setNodes, setEdges, isApplyingHistoryRef, fitView]
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const input = event.target;
      const file = input.files?.[0];
      if (!file) return;

      readWorkflowFile(file)
        .then(({ nodes: loadedNodes, edges: loadedEdges }) => applyWorkflow(loadedNodes, loadedEdges))
        .catch((err) => {
          console.error('Failed to load workflow file:', err);
          alert('โหลด workflow ไม่ได้: ไฟล์ไม่ถูกต้องหรือเสียหาย');
        })
        .finally(() => {
          input.value = '';
        });
    },
    [applyWorkflow]
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
    applyWorkflow,
  };
}