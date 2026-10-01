// src/types.ts
import type { Node, Edge, Viewport } from 'reactflow'; 

export type NodeStatus = 'idle' | 'start' | 'running' | 'success' | 'fault';

export interface PortDef { 
  id: string; 
  label?: string 
}

export interface CustomNodeData {
  label: string;
  description?: string;
  status?: NodeStatus;
  
  onRunNode?: (id: string) => void;
  onCancelNode?: (id: string) => void;

  inputs?: PortDef[];
  outputs?: PortDef[];
  
  payload?: Record<string, any>; 

  [key: string]: any; 
}

export interface LogEntry {
  id: string;          
  timestamp: string;  
  type: 'info' | 'success' | 'error' | 'warning'; 
  message: string;     
  nodeId?: string;    
}

export interface WorkflowTab {
  id: string;
  name: string;
  nodes: Node<CustomNodeData>[]; 
  edges: Edge[];                
  viewport: Viewport;            
  isDirty?: boolean;             
}
