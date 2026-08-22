import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { Card, SectionTitle } from "@/src/components/UI";
import { useAuth } from "@/src/context/AuthContext";
import { C, R, S } from "@/src/theme";

export default function WardenDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api("/warden/dashboard"));
    } catch { /* noop */ }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!data) return <View style={styles.center}><ActivityIndicator size="large" color={C.brand} /></View>;

  const stats = [
    { label: "Open complaints", value: data.open_complaints, icon: "construct-outline", color: C.info, route: "/warden/queues?tab=complaints", testID: "stat-open-complaints" },
    { label: "Cleaning to schedule", value: data.pending_cleaning, icon: "sparkles-outline", color: C.warning, route: "/warden/queues?tab=cleaning", testID: "stat-pending-cleaning" },
    { label: "Awaiting student confirm", value: data.awaiting_confirmation, icon: "hourglass-outline", color: C.brandSecondary, route: "/warden/queues?tab=cleaning", testID: "stat-awaiting-confirmation" },
    { label: "Change requests", value: data.pending_changes, icon: "swap-horizontal-outline", color: C.warning, route: "/warden/queues?tab=changes", testID: "stat-pending-changes" },
    { label: "Open threads", value: data.open_threads, icon: "chatbubbles-outline", color: C.info, route: "/threads", testID: "stat-open-threads" },
  ];

  const att = data.attendance_today;
  const attDone = att.total > 0 && att.marked >= att.total;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Text style={styles.headerTitle}>Warden Dashboard</Text>
        <Text style={styles.headerSub}>{user?.name}</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: S.lg, gap: S.xl, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        {/* Tonight's attendance */}
        <Pressable testID="attendance-today-card" onPress={() => router.push("/warden/rollcall")}>
          <Card style={[styles.attCard, { backgroundColor: attDone ? C.successBg : C.warningBg, borderColor: attDone ? C.success : C.warning }]}>
            <Ionicons name={attDone ? "checkmark-circle" : "alert-circle"} size={26} color={attDone ? C.success : C.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.attTitle}>Tonight&apos;s attendance ({att.date})</Text>
              <Text style={styles.attSub}>{att.marked} of {att.total} students marked{attDone ? " — all done!" : " — tap to complete roll call"}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
          </Card>
        </Pressable>

        {/* Occupancy */}
        <View>
          <SectionTitle title="Occupancy" />
          <View style={{ gap: S.md }}>
            {data.occupancy.map((o: any) => (
              <Card key={o.block_id} style={{ gap: S.sm }} testID={`occupancy-card-${o.block}`}>
                <View style={styles.rowBetween}>
                  <Text style={styles.blockName}>{o.block}</Text>
                  <Text style={styles.occText}>{o.occupied}/{o.capacity} beds · {o.rooms} rooms</Text>
                </View>
                <View style={styles.barBg}>
                  <View style={[styles.barFill, { width: `${o.capacity ? Math.min(100, (o.occupied / o.capacity) * 100) : 0}%` }]} />
                </View>
              </Card>
            ))}
          </View>
        </View>

        {/* Pending work */}
        <View>
          <SectionTitle title="Pending Work" />
          <View style={styles.grid}>
            {stats.map((s) => (
              <Pressable key={s.label} testID={s.testID} onPress={() => router.push(s.route as any)} style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: `${s.color}18` }]}>
                  <Ionicons name={s.icon as any} size={18} color={s.color} />
                </View>
                <Text style={styles.statNum}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  header: { backgroundColor: C.brand, paddingHorizontal: S.lg, paddingBottom: S.lg },
  headerTitle: { color: "#FFF", fontSize: 20, fontWeight: "800" },
  headerSub: { color: "#B6C4DE", fontSize: 13, marginTop: 2 },
  attCard: { flexDirection: "row", alignItems: "center", gap: S.md },
  attTitle: { fontSize: 14, fontWeight: "800", color: C.onSurface },
  attSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  blockName: { fontSize: 15, fontWeight: "800", color: C.onSurface },
  occText: { fontSize: 12, color: C.muted },
  barBg: { height: 8, borderRadius: 4, backgroundColor: C.surfaceTertiary, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4, backgroundColor: C.brandSecondary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: S.md },
  statCard: {
    width: "47.5%", backgroundColor: C.card, borderRadius: R.md, borderWidth: 1,
    borderColor: C.border, padding: S.lg, gap: 6,
  },
  statIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  statNum: { fontSize: 22, fontWeight: "800", color: C.onSurface },
  statLabel: { fontSize: 11.5, color: C.muted },
});
