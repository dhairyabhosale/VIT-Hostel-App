import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { Card, SectionTitle } from "@/src/components/UI";
import { C, R, S, STATUS_COLORS, fmtDay } from "@/src/theme";

export default function AdminAnalytics() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api("/admin/analytics"));
    } catch { /* noop */ }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!data) return <View style={styles.center}><ActivityIndicator size="large" color={C.brand} /></View>;

  const absDates = Object.entries(data.attendance.absent_by_date || {});
  const maxAbs = Math.max(1, ...absDates.map(([, v]: any) => v as number));

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Text style={styles.headerTitle}>Analytics</Text>
        <Text style={styles.headerSub}>Cross-block operations overview</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: S.lg, gap: S.xl, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        {/* Top stats */}
        <View style={styles.grid}>
          <View style={styles.statCard} testID="analytics-students">
            <Text style={styles.statNum}>{data.users.students}</Text>
            <Text style={styles.statLabel}>Students ({data.users.activated_students} activated)</Text>
          </View>
          <View style={styles.statCard} testID="analytics-complaints">
            <Text style={styles.statNum}>{data.complaints.total}</Text>
            <Text style={styles.statLabel}>Total complaints</Text>
          </View>
          <View style={styles.statCard} testID="analytics-resolution">
            <Text style={styles.statNum}>{data.complaints.avg_resolution_hours ?? "—"}</Text>
            <Text style={styles.statLabel}>Avg resolution (hrs)</Text>
          </View>
          <View style={styles.statCard} testID="analytics-cleaning-turnaround">
            <Text style={styles.statNum}>{data.cleaning.avg_turnaround_hours ?? "—"}</Text>
            <Text style={styles.statLabel}>Cleaning turnaround (hrs)</Text>
          </View>
        </View>

        {/* Occupancy */}
        <View>
          <SectionTitle title="Occupancy by Block" />
          <Card style={{ gap: S.md }}>
            {data.occupancy.map((o: any) => (
              <View key={o.block} style={{ gap: 6 }} testID={`analytics-occupancy-${o.block}`}>
                <View style={styles.rowBetween}>
                  <Text style={styles.rowTitle}>{o.block}</Text>
                  <Text style={styles.rowMeta}>{o.occupied}/{o.capacity} · {o.pct}%</Text>
                </View>
                <View style={styles.barBg}>
                  <View style={[styles.barFill, { width: `${o.pct}%` }]} />
                </View>
              </View>
            ))}
          </Card>
        </View>

        {/* Complaints by category & status */}
        <View>
          <SectionTitle title="Complaints" />
          <Card style={{ gap: S.md }}>
            <Text style={styles.subHead}>By category</Text>
            {Object.entries(data.complaints.by_category).map(([k, v]: any) => (
              <View key={k} style={styles.rowBetween}>
                <Text style={[styles.rowMeta, { textTransform: "capitalize" }]}>{k.replace("-", "/")}</Text>
                <Text style={styles.rowTitle}>{v}</Text>
              </View>
            ))}
            <View style={styles.divider} />
            <Text style={styles.subHead}>By status</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
              {Object.entries(data.complaints.by_status).map(([k, v]: any) => {
                const col = STATUS_COLORS[k] || { fg: C.muted, bg: C.surfaceTertiary };
                return (
                  <View key={k} style={[styles.statusPill, { backgroundColor: col.bg }]}>
                    <Text style={{ color: col.fg, fontSize: 12, fontWeight: "700", textTransform: "capitalize" }}>{k.replace("-", " ")}: {v}</Text>
                  </View>
                );
              })}
            </View>
          </Card>
        </View>

        {/* Attendance trends */}
        <View>
          <SectionTitle title="Absences (last 14 days)" />
          <Card style={{ gap: S.md }}>
            {absDates.length === 0 ? (
              <Text style={styles.rowMeta}>No absences recorded</Text>
            ) : (
              absDates.map(([date, count]: any) => (
                <View key={date} style={{ gap: 4 }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.rowMeta}>{fmtDay(date)}</Text>
                    <Text style={styles.rowTitle}>{count}</Text>
                  </View>
                  <View style={styles.barBg}>
                    <View style={[styles.barFill, { width: `${(count / maxAbs) * 100}%`, backgroundColor: C.error }]} />
                  </View>
                </View>
              ))
            )}
            {data.attendance.repeat_absentees.length > 0 && (
              <>
                <View style={styles.divider} />
                <Text style={styles.subHead}>Repeat absentees (2+)</Text>
                {data.attendance.repeat_absentees.map((r: any) => (
                  <View key={r.registration_number} style={styles.rowBetween}>
                    <Text style={styles.rowMeta}>{r.name} ({r.registration_number})</Text>
                    <Text style={[styles.rowTitle, { color: C.error }]}>{r.absences} nights</Text>
                  </View>
                ))}
              </>
            )}
          </Card>
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
  headerSub: { color: "#B6C4DE", fontSize: 12, marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: S.md },
  statCard: {
    width: "47.5%", backgroundColor: C.card, borderRadius: R.md, borderWidth: 1,
    borderColor: C.border, padding: S.lg, gap: 4,
  },
  statNum: { fontSize: 24, fontWeight: "800", color: C.brand },
  statLabel: { fontSize: 11, color: C.muted },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowTitle: { fontSize: 14, fontWeight: "800", color: C.onSurface },
  rowMeta: { fontSize: 13, color: C.onSurfaceSecondary },
  subHead: { fontSize: 12, fontWeight: "800", color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  barBg: { height: 8, borderRadius: 4, backgroundColor: C.surfaceTertiary, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4, backgroundColor: C.brandSecondary },
  divider: { height: 1, backgroundColor: C.divider },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.pill },
});
