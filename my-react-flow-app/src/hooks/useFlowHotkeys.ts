// src/hooks/useFlowHotkeys.ts
import { useEffect, useRef, useCallback } from 'react';
import { useReactFlow, type Node, type Edge } from 'reactflow';
import type { CustomNodeData } from '../types';

type RFNode = Node<CustomNodeData>;
type RFEdge = Edge;

type ClipboardData = {
  nodes: RFNode[];
  edges: RFEdge[];
};

type PastePos = { x: number; y: number };

export type UseFlowHotkeysOptions = {
  getPastePosition?: () => PastePos | null;
  runNodeById: (id: string) => void | Promise<void>;
  undo: () => void;
  redo: () => void;
  /** false while the editor is kept mounted but hidden (another route is showing), so keys there don't edit the canvas. */
  enabled?: boolean;
};

const isCmdOrCtrl = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

// A modal (Save Template, help, template edit) is open over the canvas: keys belong to it, not to the nodes behind it.
const isModalOpen = () => document.querySelector('[aria-modal="true"]') !== null;

const makeId = () =>
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function useFlowHotkeys(opts: UseFlowHotkeysOptions) {
  const { getPastePosition, runNodeById, undo, redo, enabled = true } = opts;
  const { getNodes, getEdges, setNodes, setEdges, screenToFlowPosition } =
    useReactFlow<CustomNodeData>();

  const clipboardRef = useRef<ClipboardData | null>(null);

  const doCopy = useCallback(() => {
    const nodes = getNodes();
    const edges = getEdges();
    const selectedNodes = nodes.filter((n) => n.selected);
    if (selectedNodes.length === 0) return;

    const selectedIds = new Set(selectedNodes.map((n) => n.id));
    const selectedEdges = edges.filter(
      (e) => selectedIds.has(e.source) && selectedIds.has(e.target)
    );

    clipboardRef.current = {
      nodes: selectedNodes.map((n) => ({ ...n })),
      edges: selectedEdges.map((e) => ({ ...e })),
    };
  }, [getNodes, getEdges]);

  const doPaste = useCallback(
    (event?: MouseEvent) => {
      const clip = clipboardRef.current;
      if (!clip || clip.nodes.length === 0) return;

      const nodes = getNodes();
      const edges = getEdges();
      const idMap = new Map<string, string>();

      let dx = 40;
      let dy = 40;

      let pastePos = getPastePosition?.();
      if (!pastePos && event) {
        const screenPos = { x: event.clientX, y: event.clientY };
        pastePos = screenToFlowPosition(screenPos);
      }

      if (pastePos) {
        const xs = clip.nodes.map((n) => n.position.x);
        const ys = clip.nodes.map((n) => n.position.y);

        if (clip.nodes.length === 1) {
          const node = clip.nodes[0];
          const width = (node.data?.width as number) || 150;
          const height = (node.data?.height as number) || 100;
          dx = pastePos.x - (node.position.x + width / 2);
          dy = pastePos.y - (node.position.y + height / 2);
        } else if (xs.length > 0 && ys.length > 0) {
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;
          dx = pastePos.x - cx;
          dy = pastePos.y - cy;
        }
      }

      const newNodes: RFNode[] = clip.nodes.map((n) => {
        const newId = makeId();
        idMap.set(n.id, newId);
        return {
          ...n,
          id: newId,
          selected: true,
          position: {
            x: n.position.x + dx,
            y: n.position.y + dy,
          },
          data: {
            ...(n.data || {}),
            status: 'idle',
            onRunNode: (id: string) => runNodeById(id),
          },
        };
      });

      const mappedEdges = clip.edges.map((e) => {
        const newSource = idMap.get(e.source);
        const newTarget = idMap.get(e.target);
        if (!newSource || !newTarget) return null;
        return {
          ...e,
          id: makeId(),
          source: newSource,
          target: newTarget,
          selected: true,
        };
      });

      const newEdges = mappedEdges.filter(Boolean) as RFEdge[];

      const clearedOldNodes = nodes.map((n) => ({ ...n, selected: false }));
      const clearedOldEdges = edges.map((e) => ({ ...e, selected: false }));

      setNodes([...clearedOldNodes, ...newNodes]);
      setEdges([...clearedOldEdges, ...newEdges]);
    },
    [getNodes, getEdges, setNodes, setEdges, getPastePosition, runNodeById, screenToFlowPosition]
  );

  const doDelete = useCallback(() => {
    const nodes = getNodes();
    const edges = getEdges();
    const selectedNodes = nodes.filter((n) => n.selected);
    const selectedEdges = edges.filter((e) => e.selected);
    if (selectedNodes.length === 0 && selectedEdges.length === 0) return;

    const removeNodeIds = new Set(selectedNodes.map((n) => n.id));
    const keptNodes = nodes.filter((n) => !removeNodeIds.has(n.id));
    const keptEdges = edges.filter(
      (e) =>
        !removeNodeIds.has(e.source) &&
        !removeNodeIds.has(e.target) &&
        !selectedEdges.includes(e)
    );

    setNodes(keptNodes);
    setEdges(keptEdges);
  }, [getNodes, getEdges, setNodes, setEdges]);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (isModalOpen()) return;

      if (isCmdOrCtrl(e) && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
          return;
        }
        if (key === 'c') {
          e.preventDefault();
          doCopy();
          return;
        }
        if (key === 'v') {
          e.preventDefault();
          doPaste();
          return;
        }
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          doDelete();
        }
      }
    };

    // React Flow's built-in Backspace delete listens on document. A modal the Lab page does not track
    // (the template edit dialog in the library) must not let it delete nodes behind it, so the key
    // stops at window (capture) before it reaches document. Typing in the modal's fields is untouched.
    const blockCanvasDeleteBehindModal = (e: KeyboardEvent) => {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      if (isTypingTarget(e.target) || !isModalOpen()) return;
      e.stopPropagation();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keydown', blockCanvasDeleteBehindModal, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keydown', blockCanvasDeleteBehindModal, true);
    };
  }, [enabled, undo, redo, doCopy, doPaste, doDelete]);
}