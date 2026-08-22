import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { Card, Empty } from "@/src/components/UI";
import { C, R, S, fmtDate } from "@/src/theme";

export default function Announcements() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api("/announcements"));
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="announcements-back-button" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Announcements</Text>
        <View style={{ width: 40 }} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: S.lg, gap: S.md, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={<Empty icon="megaphone-outline" text="No announcements yet" testID="announcements-empty" />}
        renderItem={({ item }) => (
          <Card style={{ gap: 6 }} testID={`announcement-card-${item.id}`}>
            <View style={styles.rowBetween}>
              <View style={styles.scopePill}>
                <Ionicons name={item.scope === "all" ? "globe-outline" : "business-outline"} size={12} color={C.brand} />
                <Text style={styles.scopeText}>{item.scope === "all" ? "All blocks" : item.block_name || "Block"}</Text>
              </View>
              {item.pinned && <Ionicons name="pin" size={16} color={C.warning} />}
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
            <Text style={styles.meta}>{item.posted_by_name} ({item.posted_by_role}) · {fmtDate(item.created_at)}</Text>
          </Card>
        )}
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
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  scopePill: {
    flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.brandTertiary,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.pill,
  },
  scopeText: { fontSize: 11, fontWeight: "700", color: C.brand },
  title: { fontSize: 15, fontWeight: "700", color: C.onSurface },
  body: { fontSize: 13, color: C.onSurfaceSecondary, lineHeight: 19 },
  meta: { fontSize: 11, color: C.muted, marginTop: 2 },
});
