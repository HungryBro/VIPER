import type { Edge, Node } from 'reactflow';

import type { CustomNodeData } from '../types';
import { apiFetch } from './http';


export type TemplateVisibility = 'private' | 'public';

export type WorkflowDocument = {
  version: 1;
  nodes: Node<CustomNodeData>[];
  edges: Edge[];
};

export type TemplateOwner = {
  id: number;
  display_name: string;
  avatar_url: string | null;
};

export type TemplateSummary = {
  id: number;
  owner_id: number;
  owner: TemplateOwner;
  name: string;
  description: string;
  visibility: TemplateVisibility;
  comments_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type TemplateDetail = TemplateSummary & {
  workflow: WorkflowDocument;
};

export type CurrentWorkflow = {
  name: string;
  workflow: WorkflowDocument;
};

type TemplateCreatePayload = {
  name: string;
  description: string;
  visibility: TemplateVisibility;
  workflow: WorkflowDocument;
};

type TemplateUpdatePayload = Partial<TemplateCreatePayload>;

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body.detail === 'string' ? body.detail : 'Template request failed';
    throw new Error(detail);
  }
  return body as T;
}

export async function listPublicTemplates(): Promise<TemplateSummary[]> {
  return readJson<TemplateSummary[]>(await apiFetch('/api/templates'));
}

export async function listMyTemplates(): Promise<TemplateSummary[]> {
  return readJson<TemplateSummary[]>(await apiFetch('/api/templates/mine'));
}

export async function createPlatformTemplate(
  payload: TemplateCreatePayload,
): Promise<TemplateDetail> {
  return readJson<TemplateDetail>(await apiFetch('/api/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));
}

export async function updatePlatformTemplate(
  templateId: number,
  payload: TemplateUpdatePayload,
): Promise<TemplateDetail> {
  return readJson<TemplateDetail>(await apiFetch(`/api/templates/${templateId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));
}

export async function loadPlatformTemplate(templateId: number): Promise<TemplateDetail> {
  return readJson<TemplateDetail>(await apiFetch(`/api/templates/${templateId}/load`, {
    method: 'POST',
  }));
}

export function sanitizeWorkflowDocument(
  nodes: Node<CustomNodeData>[],
  edges: Edge[],
): WorkflowDocument {
  const cleanNodes = nodes.map((node) => {
    const nodeFields = { ...node };
    delete nodeFields.selected;
    delete nodeFields.dragging;

    const dataFields = { ...node.data };
    const payload = dataFields.payload;
    delete dataFields.onRunNode;
    delete dataFields.payload;
    const cleanData: CustomNodeData = {
      ...dataFields,
      label: node.data.label,
      status: 'idle',
    };

    // Runtime image/output data is machine-specific. Algorithm parameters are portable.
    if (payload?.params !== undefined) {
      cleanData.payload = { params: payload.params };
    }

    return { ...nodeFields, data: cleanData };
  });

  const cleanEdges = edges.map((edge) => {
    const cleanEdge = { ...edge };
    delete cleanEdge.selected;
    return cleanEdge;
  });
  return JSON.parse(JSON.stringify({ version: 1, nodes: cleanNodes, edges: cleanEdges })) as WorkflowDocument;
}
