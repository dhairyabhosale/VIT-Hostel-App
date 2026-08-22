import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { Card, Empty } from "@/src/components/UI";
import { C, S, fmtDate } from "@/src/theme";

const TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  attendance: { icon: "calendar-outline", color: C.error },
  complaint: { icon: "build-outline", color: C.info },
  cleaning: { icon: "sparkles-outline", color: C.success },
  change_request: { icon: "swap-horizontal-outline", color: C.warning },
  announcement: { icon: "megaphone-outline", color: C.brand },
};

export default function Notifications() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api("/notifications");
      setItems(data);
      await api("/notifications/mark-read", { method: "POST" });
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="notifications-back-button" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: S.lg, gap: S.md, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={<Empty icon="notifications-outline" text="No notifications yet" testID="notifications-empty" />}
        renderItem={({ item }) => {
          const t = TYPE_ICONS[item.type] || TYPE_ICONS.announcement;
          return (
            <Card style={[styles.row, !item.read && { borderColor: C.brandSecondary }]} testID={`notification-card-${item.id}`}>
              <View style={[styles.iconWrap, { backgroundColor: `${t.color}18` }]}>
                <Ionicons name={t.icon as any} size={18} color={t.color} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.body}>{item.body}</Text>
                <Text style={styles.meta}>{fmtDate(item.created_at)}</Text>
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  header: {
    backgroundColor: C.brand, flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", paddingHorizontal: S.md, paddingBottom: S.md,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#FFF", fontSize: 17, fontWeight: "700" },
  row: { flexDirection: "row", gap: S.md, alignItems: "flex-start" },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 14, fontWeight: "700", color: C.onSurface },
  body: { fontSize: 13, color: C.onSurfaceSecondary, lineHeight: 18 },
  meta: { fontSize: 11, color: C.muted, marginTop: 2 },
});
