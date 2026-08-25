// File: my-react-flow-app/src/lib/runners/saver.ts
import type { Node, Edge } from 'reactflow';
import type { CustomNodeData } from '../../types';
import { abs } from '../api'; 
import { updateNodeStatus, findInputImage } from './utils';

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getSourceNode(nodeId: string, nodes: Node<CustomNodeData>[], edges: Edge[]) {
  const edge = edges.find((e) => e.target === nodeId);
  if (!edge) return null;
  return nodes.find((n) => n.id === edge.source);
}

function generateFilename(node: Node<CustomNodeData>, extension: string): string {
  const now = new Date();
  
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `${year}${month}${day}_${hour}${minute}${second}`;

  const rawLabel = node.data.label || node.type || "output";
  const cleanLabel = rawLabel.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');

  return `${cleanLabel}_${timestamp}.${extension}`;
}

function findInputPayload(
  nodeId: string,
  nodes: Node<CustomNodeData>[],
  edges: Edge[]
): any {
  const incomingEdge = edges.find((e) => e.target === nodeId);
  if (!incomingEdge) return null;

  const parentNode = nodes.find((n) => n.id === incomingEdge.source);
  if (!parentNode || !parentNode.data) return null;

  return parentNode.data.payload;
}

export async function runSaveImage(
  node: Node<CustomNodeData>,
  setNodes: React.Dispatch<React.SetStateAction<Node<CustomNodeData>[]>>,
  nodes: Node<CustomNodeData>[],
  edges: Edge[]
) {
  const nodeId = node.id;
  await updateNodeStatus(nodeId, 'running', setNodes);

  try {
    const imageUrlPath = findInputImage(nodeId, nodes, edges);

    if (!imageUrlPath) {
      throw new Error("No image found to download (Please check input connection).");
    }

    const fetchUrl = abs(imageUrlPath);
    if (!fetchUrl) throw new Error(`Invalid Image URL generated from: ${imageUrlPath}`);

    console.log(`[SaveImage] Downloading from: ${fetchUrl}`);

    const response = await fetch(fetchUrl, {
      method: 'GET',
      mode: 'cors', 
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    
    let ext = 'png';
    if (blob.type === 'image/jpeg') ext = 'jpg';
    else if (blob.type === 'image/png') ext = 'png';
    else if (typeof imageUrlPath === 'string' && imageUrlPath.toLowerCase().endsWith('.jpg')) ext = 'jpg';

    const sourceNode = getSourceNode(nodeId, nodes, edges);
    const targetNamingNode = sourceNode || node;
    const filename = generateFilename(targetNamingNode, ext);

    triggerBrowserDownload(blob, filename);

    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                status: 'success',
                output: { saved_path: "Downloaded" },
              },
            }
          : n
      )
    );
  } catch (err: any) {
    console.error("❌ Save Image Error:", err);
    await updateNodeStatus(nodeId, 'fault', setNodes);
    throw new Error(err.message || "Failed to download image"); 
  }
}

export async function runSaveJson(
  node: Node<CustomNodeData>,
  setNodes: React.Dispatch<React.SetStateAction<Node<CustomNodeData>[]>>,
  nodes: Node<CustomNodeData>[],
  edges: Edge[]
) {
  const nodeId = node.id;
  await updateNodeStatus(nodeId, 'running', setNodes);

  try {
    const payload = findInputPayload(nodeId, nodes, edges);

    if (!payload) {
      throw new Error("Input node does not have any data (Please run the parent node first).");
    }

    let finalData = payload.json || payload; 

    const targetUrl =
        payload.json_url ||                 
        payload.output?.json_url ||         
        payload.json_path ||                
        payload.output?.match_json ||       
        null;

    if (targetUrl && (typeof targetUrl === 'string')) {
      if (targetUrl.startsWith('/static') || targetUrl.startsWith('http')) {
        try {
          const fetchUrl = abs(targetUrl);
          
          if (fetchUrl) {
            console.log(`[SaveJSON] Attempting to fetch full JSON from: ${fetchUrl}`);
            const res = await fetch(fetchUrl);
            
            if (res.ok) {
              finalData = await res.json();
              console.log("✅ [SaveJSON] Fetched full JSON successfully.");
            } else {
              console.warn(`⚠️ [SaveJSON] Failed to fetch JSON from ${fetchUrl} (${res.status}), using payload fallback.`);
            }
          }
        } catch (err) {
          console.warn("[SaveJSON] Fetch error, using payload fallback:", err);
        }
      }
    }

    const jsonString = JSON.stringify(finalData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    
    const sourceNode = getSourceNode(nodeId, nodes, edges);
    const targetNamingNode = sourceNode || node;
    const filename = generateFilename(targetNamingNode, 'json');

    triggerBrowserDownload(blob, filename);

    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                status: 'success',
                output: { saved_path: "Downloaded JSON" },
              },
            }
          : n
      )
    );
  } catch (err: any) {
    console.error("❌ Save JSON Error:", err.message);
    await updateNodeStatus(nodeId, 'fault', setNodes);
    throw err;
  }
}
