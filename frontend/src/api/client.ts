import { storage } from "@/src/utils/storage";

const rawBase = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();
const BASE = rawBase?.replace(/\/$/, "");
export const TOKEN_KEY = "vhc_token";
export const BIO_TOKEN_KEY = "vhc_bio_token";

type Opts = { method?: string; body?: any; timeoutMs?: number };

function getBaseUrl(): string {
  if (!BASE) {
    throw new Error("Backend is not configured. Please update EXPO_PUBLIC_BACKEND_URL.");
  }
  if (!/^https?:\/\//i.test(BASE)) {
    throw new Error("Backend URL is invalid. It must start with http:// or https://.");
  }
  return BASE;
}

export async function api(path: string, opts: Opts = {}): Promise<any> {
  const token = await storage.secureGet(TOKEN_KEY, null);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);

  try {
    const res = await fetch(`${getBaseUrl()}/api${path}`, {
      method: opts.method || "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = typeof data?.detail === "string" ? data.detail : `Request failed (${res.status})`;
      const err: any = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("The server took too long to respond. Please try again.");
    }
    if (error?.status) throw error;
    if (error instanceof TypeError) {
      throw new Error("Unable to connect to the hostel server. Check your internet connection and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function backendUrl(): string {
  return getBaseUrl();
}
