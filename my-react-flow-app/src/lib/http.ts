export const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

export async function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(apiUrl(input), {
    ...init,
    credentials: init.credentials ?? 'include',
  });

  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('viper:unauthorized'));
  }

  return response;
}
