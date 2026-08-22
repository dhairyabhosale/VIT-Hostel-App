import React, { createContext, useContext, useRef, useState, useCallback } from "react";
import { Text, StyleSheet, Animated, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C, R, S } from "@/src/theme";

type ToastType = "success" | "error" | "info";
type Ctx = { show: (msg: string, type?: ToastType) => void };

const ToastContext = createContext<Ctx>({ show: () => {} });
export const useToast = () => useContext(ToastContext);

const BG: Record<ToastType, string> = { success: C.success, error: C.error, info: C.brandSecondary };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [type, setType] = useState<ToastType>("info");
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<any>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback((m: string, t: ToastType = "info") => {
    setMsg(m);
    setType(t);
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== "web" }).start();
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: Platform.OS !== "web" }).start(() => setMsg(null));
    }, 3200);
  }, [opacity]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {msg && (
        <Animated.View
          testID="toast-message"
          pointerEvents="none"
          style={[styles.toast, { top: insets.top + 8, backgroundColor: BG[type], opacity }]}
        >
          <Text style={styles.text}>{msg}</Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: S.lg,
    right: S.lg,
    borderRadius: R.md,
    paddingVertical: S.md,
    paddingHorizontal: S.lg,
    zIndex: 9999,
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  text: { color: "#FFF", fontSize: 14, fontWeight: "600", textAlign: "center" },
});
