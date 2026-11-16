// src/lib/flowConfig.ts
import { MarkerType, type DefaultEdgeOptions } from 'reactflow';

export const defaultEdgeOptions: DefaultEdgeOptions = {
  type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
  style: { strokeWidth: 2, stroke: '#64748b' },
};
