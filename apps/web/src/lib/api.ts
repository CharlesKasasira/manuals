export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const AUTH_COOKIE_NAME = "manualflow.token";

export type ApiEnvelope<T> = { data: T; meta?: Record<string, unknown> };

export function getToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("manualflow.token");
}

export function setToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("manualflow.token", token);
  document.cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; SameSite=Lax`;
}

export function clearToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("manualflow.token");
  document.cookie = `${AUTH_COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  return response.json();
}

export async function publicApi<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Request failed with ${response.status}`);
  return response.json();
}
