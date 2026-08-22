import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { Empty, StatusBadge } from "@/src/components/UI";
import { C, R, S, fmtDay, fmtDate } from "@/src/theme";

export default function StudentAttendance() {
  const insets = useSafeAreaInsets();
  const [records, setRecords] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRecords(await api("/student/attendance"));
    } catch { /* noop */ }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const present = records.filter((r) => r.status === "present").length;
  const absent = records.filter((r) => r.status === "absent").length;
  const leave = records.filter((r) => r.status === "on-leave").length;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Text style={styles.headerTitle}>My Attendance</Text>
        <Text style={styles.headerSub}>Marked nightly by your warden. You&apos;ll be notified immediately if marked absent.</Text>
        <View style={styles.statsRow}>
          <View style={styles.statPill} testID="attendance-stat-present">
            <Text style={[styles.statNum, { color: "#6EE7B7" }]}>{present}</Text>
            <Text style={styles.statLabel}>Present</Text>
          </View>
          <View style={styles.statPill} testID="attendance-stat-absent">
            <Text style={[styles.statNum, { color: "#FCA5A5" }]}>{absent}</Text>
            <Text style={styles.statLabel}>Absent</Text>
          </View>
          <View style={styles.statPill} testID="attendance-stat-leave">
            <Text style={[styles.statNum, { color: "#FCD34D" }]}>{leave}</Text>
            <Text style={styles.statLabel}>On leave</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={records}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: S.lg, gap: S.sm, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={<Empty icon="calendar-outline" text="No attendance records yet. Your warden marks attendance each night." testID="attendance-empty" />}
        renderItem={({ item }) => (
          <View style={styles.row} testID={`attendance-row-${item.date}`}>
            <View style={styles.dateBox}>
              <Ionicons name="moon-outline" size={16} color={C.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.dateText}>{fmtDay(item.date)}</Text>
              <Text style={styles.metaText}>Marked by {item.marked_by_name} · {fmtDate(item.marked_at)}</Text>
            </View>
            <StatusBadge status={item.status} testID={`attendance-status-${item.date}`} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  header: { backgroundColor: C.brand, paddingHorizontal: S.lg, paddingBottom: S.lg, gap: S.md },
  headerTitle: { color: "#FFF", fontSize: 20, fontWeight: "800" },
  headerSub: { color: "#B6C4DE", fontSize: 12, lineHeight: 17 },
  statsRow: { flexDirection: "row", gap: S.md },
  statPill: { flex: 1, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: R.md, padding: S.md, alignItems: "center", gap: 2 },
  statNum: { fontSize: 20, fontWeight: "800" },
  statLabel: { fontSize: 11, color: "#B6C4DE" },
  row: {
    flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: C.card,
    borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: S.md,
  },
  dateBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.brandTertiary, alignItems: "center", justifyContent: "center" },
  dateText: { fontSize: 14, fontWeight: "700", color: C.onSurface },
  metaText: { fontSize: 11, color: C.muted, marginTop: 1 },
});
