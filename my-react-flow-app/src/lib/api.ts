// src/lib/api.ts
import { API_BASE, apiFetch } from './http';

export { API_BASE };


export const abs = (url?: string) => {
  if (!url) return undefined;
  if (/^(https?:|blob:|data:)/i.test(url)) return url;
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
};

export const absStrict = (url: string) =>
  /^(https?:|blob:|data:)/i.test(url) ? url : `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;

async function handleResponse(resp: Response) {
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    const msg = errBody.detail || `Request failed with status ${resp.status}`;
    throw new Error(msg);
  }
  return resp.json();
}

/** POST a JSON body to a backend path and return the parsed response; throws with the server's `detail` on failure. */
async function postJson(path: string, body?: unknown, signal?: AbortSignal) {
  const resp = await apiFetch(`${API_BASE}${path}`, body === undefined
    ? { method: 'POST', signal }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  return handleResponse(resp);
}

async function getJson(path: string, signal?: AbortSignal) {
  return handleResponse(await apiFetch(`${API_BASE}${path}`, { signal }));
}

type Params = Record<string, any>;

// ---------- 1. Core / Upload ----------
export async function uploadImages(files: File[], signal?: AbortSignal) {
  const formData = new FormData();
  for (const f of files) formData.append("files", f);
  const resp = await apiFetch(`${API_BASE}/api/upload`, {
    method: "POST",
    body: formData,
    signal,
  });
  if (!resp.ok) {
    // ข้อความจาก server (เช่น 413 เกินขนาด, 422 ชนิดไฟล์) บอกผู้ใช้ได้ตรงกว่า "Upload failed"
    let detail = "";
    try {
      const body = await resp.json();
      detail = typeof body?.detail === "string" ? body.detail : "";
    } catch {
      // body ไม่ใช่ JSON
    }
    throw new Error(detail ? `Upload failed (${resp.status}): ${detail}` : "Upload failed");
  }
  return await resp.json();
}

// ---------- Object Detection / XAI ----------
export const runYOLOTrain = (request: Params, signal?: AbortSignal) => postJson('/api/detection/train', request, signal);
export const startYOLOTrain = (request: Params, signal?: AbortSignal) => postJson('/api/detection/train/start', request, signal);
export const getYOLOTrainJob = (jobId: string, signal?: AbortSignal) =>
  getJson(`/api/detection/train/jobs/${encodeURIComponent(jobId)}`, signal);
export const cancelYOLOTrainJob = (jobId: string, signal?: AbortSignal) =>
  postJson(`/api/detection/train/jobs/${encodeURIComponent(jobId)}/cancel`, undefined, signal);
export const getYOLOModels = (signal?: AbortSignal): Promise<{ models: { path: string; name: string }[] }> =>
  getJson('/api/detection/models', signal);
export const createYOLODataset = (request: Params, signal?: AbortSignal) => postJson('/api/detection/dataset', request, signal);
export const runYOLODetect = (request: Params, signal?: AbortSignal) => postJson('/api/detection/detect', request, signal);
export const runYOLOGradCAM = (request: Params, signal?: AbortSignal) => postJson('/api/detection/gradcam', request, signal);

// ---------- 2. Feature Detection (SIFT, SURF, ORB) ----------
export const runSift = (image_path: string, params?: Params, signal?: AbortSignal) => postJson('/api/feature/sift', { image_path, params }, signal);
export const runSurf = (image_path: string, params?: Params, signal?: AbortSignal) => postJson('/api/feature/surf', { image_path, params }, signal);
export const runOrb = (image_path: string, params?: Params, signal?: AbortSignal) => postJson('/api/feature/orb', { image_path, params }, signal);

// ---------- 3. Enhancement ----------
export const runCLAHE = (image_path: string, params?: Params, signal?: AbortSignal) => postJson('/api/enhancement/clahe', { image_path, params }, signal);
export const runMSRCR = (image_path: string, params?: Params, signal?: AbortSignal) => postJson('/api/enhancement/msrcr', { image_path, params }, signal);
export const runZeroDCE = (image_path: string, params?: Params, signal?: AbortSignal) => postJson('/api/enhancement/zero_dce', { image_path, params }, signal);

// ---------- 4. Matching & Alignment ----------
export const runBfmatcher = (jsonA: string, jsonB: string, params?: any, signal?: AbortSignal) =>
  postJson('/api/match/bf', { json_a: jsonA, json_b: jsonB, ...params }, signal);
export const runFlannmatcher = (jsonA: string, jsonB: string, params?: any, signal?: AbortSignal) =>
  postJson('/api/match/flann', { json_a: jsonA, json_b: jsonB, ...params }, signal);
export const runHomographyAlignment = (match_json: string, params?: any, signal?: AbortSignal) =>
  postJson('/api/alignment/homography', { match_json, ...params }, signal);
export const runAffineAlignment = (match_json: string, params?: any, signal?: AbortSignal) =>
  postJson('/api/alignment/affine', { match_json, ...params }, signal);

// ---------- 5. Quality Metrics ----------
export const runBrisque = (image_path: string, signal?: AbortSignal) => postJson('/api/quality/brisque', { image_path }, signal);
export const runPsnr = (originalPath: string, processedPath: string, params?: any, signal?: AbortSignal) =>
  postJson('/api/quality/psnr', { original_path: originalPath, processed_path: processedPath, params }, signal);
export const runSsim = (originalPath: string, processedPath: string, params?: any, signal?: AbortSignal) =>
  postJson('/api/quality/ssim', { original_path: originalPath, processed_path: processedPath, params }, signal);

// ---------- 6.Classification ----------
export const runSnake = (req: any, signal?: AbortSignal) => postJson('/api/classify/snake', req, signal);
export const runOtsuClassification = (image_path: string, params?: any, signal?: AbortSignal) =>
  postJson('/api/classify/otsu', { image_path, ...params }, signal);

// ---------- 6. Evaluation ----------
export const runClassificationEvaluation = (request: Params, signal?: AbortSignal) => postJson('/api/evaluation/classification', request, signal);
export const runYOLOClassificationEvaluation = (request: Params, signal?: AbortSignal) => postJson('/api/evaluation/classification/yolo', request, signal);
export const runDetectionEvaluation = (request: Params, signal?: AbortSignal) => postJson('/api/evaluation/detection', request, signal);

// ---------- 7. Segmentation ----------
export const runDeepLab = (image_path: string, params?: any, model_path?: string, signal?: AbortSignal) =>
  postJson('/api/segmentation/deeplab', { image_path, params, model_path }, signal);
export const runUNET = (image_path: string, params?: any, model_path?: string, signal?: AbortSignal) =>
  postJson('/api/segmentation/unet', { image_path, params, model_path }, signal);
export const runMaskRCNN = (image_path: string, params?: any, model_path?: string, signal?: AbortSignal) =>
  postJson('/api/segmentation/maskrcnn', { image_path, params, model_path }, signal);

// ---------- 8. Restoration ----------
export const runDncnn = (image_path: string, params?: any, signal?: AbortSignal) => postJson('/api/restoration/dncnn', { image_path, params }, signal);
export const runSwinIR = (image_path: string, params?: any, signal?: AbortSignal) => postJson('/api/restoration/swinir', { image_path, params }, signal);
export const runRealESRGAN = (image_path: string, params?: any, signal?: AbortSignal) => postJson('/api/restoration/realesrgan', { image_path, params }, signal);
