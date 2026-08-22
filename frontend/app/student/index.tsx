import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { Card, SectionTitle, StatusBadge, Empty } from "@/src/components/UI";
import { useAuth } from "@/src/context/AuthContext";
import { C, R, S, CATEGORY_ICONS } from "@/src/theme";

export default function StudentDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api("/student/dashboard"));
    } catch { /* noop */ }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!data) {
    return <View style={styles.center}><ActivityIndicator size="large" color={C.brand} /></View>;
  }

  const roomLine = data.room
    ? `${data.room.room_type.charAt(0).toUpperCase() + data.room.room_type.slice(1)}, ${data.room.ac_status}`
    : "";

  const actions = [
    { label: "Request Cleaning", icon: "sparkles-outline", route: "/new-request?type=cleaning", testID: "action-request-cleaning" },
    { label: "Report Issue", icon: "construct-outline", route: "/new-request?type=complaint", testID: "action-report-issue" },
    { label: "Request Change", icon: "swap-horizontal-outline", route: "/new-request?type=change", testID: "action-request-change" },
    { label: "Contact Warden", icon: "chatbubbles-outline", route: "/threads", testID: "action-contact-warden" },
  ];

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + S.sm }]}>
        <View>
          <Text style={styles.greeting}>Hi, {user?.name?.split(" ")[0]}</Text>
          <Text style={styles.regNo}>{user?.registration_number}</Text>
        </View>
        <Pressable testID="notifications-bell" onPress={() => router.push("/notifications")} style={styles.bellBtn}>
          <Ionicons name="notifications-outline" size={22} color="#FFF" />
          {data.unread_notifications > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{data.unread_notifications}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: S.lg, gap: S.xl, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero allocation card */}
        <View style={styles.heroWrap} testID="allocation-hero-card">
          <LinearGradient colors={[C.brand, C.brandSecondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            {data.allocation ? (
              <>
                <View style={styles.heroTop}>
                  <View>
                    <Text style={styles.heroLabel}>MY ROOM</Text>
                    <Text style={styles.heroRoom}>{data.room?.room_number}</Text>
                    <Text style={styles.heroBlock}>{data.block?.name} · {roomLine}</Text>
                  </View>
                  <View style={styles.heroIconWrap}>
                    <Ionicons name="bed-outline" size={26} color="#FFF" />
                  </View>
                </View>
                <View style={styles.heroDivider} />
                <View style={styles.heroBottom}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="restaurant-outline" size={15} color="#B6C4DE" />
                    <Text style={styles.heroMess}>{data.mess_plan?.name} Mess · {data.mess_plan?.mess_hall_location}</Text>
                  </View>
                </View>
              </>
            ) : (
              <Text style={{ color: "#FFF", fontSize: 14 }}>No room allocation yet. Contact hostel admin.</Text>
            )}
          </LinearGradient>
        </View>

        {/* Roommates */}
        {data.roommates?.length > 0 && (
          <View>
            <SectionTitle title="Roommates" />
            <Card style={{ gap: S.md }}>
              {data.roommates.map((rm: any, i: number) => (
                <View key={i} style={styles.roommateRow} testID={`roommate-row-${i}`}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{rm.name.split(" ").map((w: string) => w[0]).slice(0, 2).join("")}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.roommateName}>{rm.name}</Text>
                    <Text style={styles.roommateReg}>{rm.registration_number}</Text>
                  </View>
                  {rm.phone ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons name="call-outline" size={14} color={C.success} />
                      <Text style={{ fontSize: 13, color: C.onSurfaceSecondary, fontWeight: "600" }}>{rm.phone}</Text>
                    </View>
                  ) : (
                    <Text style={{ fontSize: 11, color: C.mutedLight, fontStyle: "italic" }}>Number private</Text>
                  )}
                </View>
              ))}
            </Card>
          </View>
        )}

        {/* Quick actions */}
        <View>
          <SectionTitle title="Quick Actions" />
          <View style={styles.actionsGrid}>
            {actions.map((a) => (
              <Pressable key={a.label} testID={a.testID} onPress={() => router.push(a.route as any)} style={styles.actionCard}>
                <View style={styles.actionIcon}>
                  <Ionicons name={a.icon as any} size={22} color={C.brand} />
                </View>
                <Text style={styles.actionLabel}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Open items summary */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryPill} testID="summary-open-complaints">
            <Text style={styles.summaryNum}>{data.open_complaints}</Text>
            <Text style={styles.summaryLabel}>Open complaints</Text>
          </View>
          <View style={styles.summaryPill} testID="summary-pending-cleaning">
            <Text style={styles.summaryNum}>{data.pending_cleaning}</Text>
            <Text style={styles.summaryLabel}>Cleaning pending</Text>
          </View>
          <View style={styles.summaryPill} testID="summary-pending-changes">
            <Text style={styles.summaryNum}>{data.pending_changes}</Text>
            <Text style={styles.summaryLabel}>Change requests</Text>
          </View>
        </View>

        {/* Recent complaints */}
        <View>
          <SectionTitle
            title="Recent Complaints"
            right={
              <Pressable testID="see-all-requests-link" onPress={() => router.push("/student/requests")}>
                <Text style={{ color: C.info, fontSize: 13, fontWeight: "600" }}>See all</Text>
              </Pressable>
            }
          />
          {data.recent_complaints?.length ? (
            <View style={{ gap: S.md }}>
              {data.recent_complaints.map((c: any) => (
                <Pressable key={c.id} testID={`recent-complaint-${c.id}`} onPress={() => router.push(`/complaint/${c.id}`)}>
                  <Card style={styles.complaintRow}>
                    <View style={styles.complaintIcon}>
                      <Ionicons name={(CATEGORY_ICONS[c.category] || "build-outline") as any} size={18} color={C.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.complaintTitle} numberOfLines={1}>{c.description}</Text>
                      <Text style={styles.complaintMeta}>{c.category.replace("-", "/")}</Text>
                    </View>
                    <StatusBadge status={c.status} />
                  </Card>
                </Pressable>
              ))}
            </View>
          ) : (
            <Card><Empty icon="checkmark-done-outline" text="No complaints filed" /></Card>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  topBar: {
    backgroundColor: C.brand, flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", paddingHorizontal: S.lg, paddingBottom: S.lg,
  },
  greeting: { color: "#FFF", fontSize: 20, fontWeight: "800" },
  regNo: { color: "#B6C4DE", fontSize: 12, marginTop: 2 },
  bellBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.brandSecondary, alignItems: "center", justifyContent: "center" },
  bellBadge: {
    position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: C.error, alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  bellBadgeText: { color: "#FFF", fontSize: 10, fontWeight: "800" },
  heroWrap: { borderRadius: R.lg, overflow: "hidden" },
  hero: { padding: S.xl, gap: S.lg },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  heroLabel: { color: "#8AA0C6", fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  heroRoom: { color: "#FFF", fontSize: 32, fontWeight: "800", marginTop: 4 },
  heroBlock: { color: "#B6C4DE", fontSize: 14, marginTop: 2 },
  heroIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  heroDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.15)" },
  heroBottom: {},
  heroMess: { color: "#B6C4DE", fontSize: 13 },
  roommateRow: { flexDirection: "row", alignItems: "center", gap: S.md },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: C.brand, fontSize: 13, fontWeight: "800" },
  roommateName: { fontSize: 14, fontWeight: "700", color: C.onSurface },
  roommateReg: { fontSize: 12, color: C.muted },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: S.md },
  actionCard: {
    width: "47.5%", backgroundColor: C.card, borderRadius: R.md, padding: S.lg,
    borderWidth: 1, borderColor: C.border, gap: S.md, minHeight: 96,
  },
  actionIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.brandTertiary, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 13, fontWeight: "700", color: C.onSurface },
  summaryRow: { flexDirection: "row", gap: S.md },
  summaryPill: { flex: 1, backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: S.md, alignItems: "center", gap: 2 },
  summaryNum: { fontSize: 20, fontWeight: "800", color: C.brand },
  summaryLabel: { fontSize: 10, color: C.muted, textAlign: "center" },
  complaintRow: { flexDirection: "row", alignItems: "center", gap: S.md },
  complaintIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.brandTertiary, alignItems: "center", justifyContent: "center" },
  complaintTitle: { fontSize: 13, fontWeight: "600", color: C.onSurface },
  complaintMeta: { fontSize: 11, color: C.muted, textTransform: "capitalize" },
});
