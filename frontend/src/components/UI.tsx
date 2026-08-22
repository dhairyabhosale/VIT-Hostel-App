import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator, ViewStyle, TextInputProps } from "react-native";

import { C, R, S, STATUS_COLORS } from "@/src/theme";

export function Card({ children, style, testID }: { children: React.ReactNode; style?: ViewStyle; testID?: string }) {
  return <View testID={testID} style={[styles.card, style]}>{children}</View>;
}

export function Btn({
  title, onPress, variant = "primary", disabled, loading, testID, small, icon,
}: {
  title: string; onPress: () => void; variant?: "primary" | "secondary" | "danger" | "ghost" | "success";
  disabled?: boolean; loading?: boolean; testID?: string; small?: boolean; icon?: string;
}) {
  const bg = variant === "primary" ? C.brand : variant === "danger" ? C.error : variant === "success" ? C.success : variant === "secondary" ? C.brandTertiary : "transparent";
  const fg = variant === "secondary" ? C.brand : variant === "ghost" ? C.brand : "#FFF";
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        variant === "ghost" && { borderWidth: 1, borderColor: C.borderStrong },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {icon ? <Ionicons name={icon as any} size={small ? 15 : 18} color={fg} /> : null}
          <Text style={[styles.btnText, small && { fontSize: 13 }, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function StatusBadge({ status, testID }: { status: string; testID?: string }) {
  const c = STATUS_COLORS[status] || { fg: C.muted, bg: C.surfaceTertiary };
  return (
    <View testID={testID} style={[styles.badge, { backgroundColor: c.bg }]}>
      <View style={[styles.dot, { backgroundColor: c.fg }]} />
      <Text style={[styles.badgeText, { color: c.fg }]}>{status.replace(/-/g, " ").replace(/_/g, " ")}</Text>
    </View>
  );
}

export function Chip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? C.brand : C.card, borderColor: selected ? C.brand : C.border }]}
    >
      <Text style={{ color: selected ? "#FFF" : C.onSurfaceSecondary, fontSize: 13, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

export function Input({ label, testID, style, ...props }: TextInputProps & { label?: string; testID?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <TextInput
        testID={testID}
        placeholderTextColor={C.mutedLight}
        style={[styles.input, props.multiline && { height: 90, textAlignVertical: "top", paddingTop: S.md }, style]}
        {...props}
      />
    </View>
  );
}

export function SectionTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {right}
    </View>
  );
}

export function Empty({ icon = "file-tray-outline", text, testID }: { icon?: string; text: string; testID?: string }) {
  return (
    <View testID={testID} style={styles.empty}>
      <Ionicons name={icon as any} size={40} color={C.mutedLight} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvKey}>{k}</Text>
      <Text style={styles.kvVal}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: R.md,
    padding: S.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  btn: {
    minHeight: 48,
    borderRadius: R.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: S.lg,
  },
  btnSmall: { minHeight: 38, paddingHorizontal: S.md, borderRadius: R.sm + 2 },
  btnText: { fontSize: 15, fontWeight: "700" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: R.pill,
    alignSelf: "flex-start",
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: R.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  input: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.borderStrong,
    borderRadius: R.md,
    paddingHorizontal: S.lg,
    height: 48,
    fontSize: 15,
    color: C.onSurface,
  },
  inputLabel: { fontSize: 13, fontWeight: "600", color: C.onSurfaceSecondary },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: S.md },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: C.onSurface },
  empty: { alignItems: "center", paddingVertical: S.xxl, gap: S.md },
  emptyText: { color: C.muted, fontSize: 14, textAlign: "center", paddingHorizontal: S.xl },
  kvRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  kvKey: { color: C.muted, fontSize: 13 },
  kvVal: { color: C.onSurface, fontSize: 13, fontWeight: "600", flexShrink: 1, textAlign: "right" },
});
