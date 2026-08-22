import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
export const TOKEN_KEY = "vhc_token";
export const BIO_TOKEN_KEY = "vhc_bio_token";

type Opts = { method?: string; body?: any };

export async function api(path: string, opts: Opts = {}): Promise<any> {
  const token = await storage.secureGet(TOKEN_KEY, null);
  const res = await fetch(`${BASE}/api${path}`, {
    method: opts.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.detail === "string" ? data.detail : `Request failed (${res.status})`;
    const err: any = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}
