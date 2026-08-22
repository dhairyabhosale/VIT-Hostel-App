import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

import { api, TOKEN_KEY, BIO_TOKEN_KEY } from "@/src/api/client";
import { storage } from "@/src/utils/storage";

export type User = {
  id: string;
  role: "student" | "warden" | "admin";
  name: string;
  registration_number?: string;
  email?: string;
  phone?: string;
  block_ids?: string[];
  share_phone?: boolean;
};

type QuickFlags = { mpin?: boolean; biometric?: boolean; name?: string } | null;

type Ctx = {
  user: User | null;
  loading: boolean;
  quickFlags: QuickFlags;
  deviceId: string | null;
  setSession: (token: string, user: User) => Promise<void>;
  login: (identifier: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setQuickFlags: (f: QuickFlags) => Promise<void>;
};

const AuthContext = createContext<Ctx>(null as any);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [quickFlags, setQF] = useState<QuickFlags>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      let did = await storage.getItem("vhc_device_id", null as any);
      if (!did) {
        did = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        await storage.setItem("vhc_device_id", did);
      }
      setDeviceId(did as string);
      const qf = await storage.getItem("vhc_quick_flags", null as any);
      if (qf) {
        try { setQF(JSON.parse(qf as string)); } catch { /* noop */ }
      }
      const token = await storage.secureGet(TOKEN_KEY, null);
      if (token) {
        try {
          const me = await api("/auth/me");
          setUser(me);
        } catch {
          await storage.secureRemove(TOKEN_KEY);
        }
      }
      setLoading(false);
    })();
  }, []);

  const setSession = useCallback(async (token: string, u: User) => {
    await storage.secureSet(TOKEN_KEY, token);
    setUser(u);
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await api("/auth/login", { method: "POST", body: { identifier, password } });
    await setSession(res.access_token, res.user);
    return res.user as User;
  }, [setSession]);

  const logout = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await api("/auth/me");
      setUser(me);
    } catch { /* noop */ }
  }, []);

  const setQuickFlags = useCallback(async (f: QuickFlags) => {
    setQF(f);
    if (f) await storage.setItem("vhc_quick_flags", JSON.stringify(f));
    else await storage.removeItem("vhc_quick_flags");
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, quickFlags, deviceId, setSession, login, logout, refreshUser, setQuickFlags }}>
      {children}
    </AuthContext.Provider>
  );
}

export { TOKEN_KEY, BIO_TOKEN_KEY };
