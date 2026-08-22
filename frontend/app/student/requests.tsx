import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ScrollView, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { Btn, Card, Empty, StatusBadge } from "@/src/components/UI";
import { C, R, S, CATEGORY_ICONS, fmtDate } from "@/src/theme";

const TYPES = [
  { key: "cleaning", label: "Cleaning" },
  { key: "complaint", label: "Maintenance" },
  { key: "change", label: "Changes" },
];

export default function StudentRequests() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [type, setType] = useState("cleaning");
  const [view, setView] = useState<"active" | "history">("active");
  const [items, setItems] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      if (type === "cleaning") {
        const [list, avail] = await Promise.all([
          api(`/student/cleaning?view=${view}`),
          api("/student/cleaning/availability"),
        ]);
        setItems(list);
        setAvailability(avail);
      } else if (type === "complaint") {
        setItems(await api(`/student/complaints?view=${view}`));
      } else {
        const all = await api("/student/change-requests");
        setItems(view === "active" ? all.filter((r: any) => r.status === "pending") : all.filter((r: any) => r.status !== "pending"));
      }
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  }, [type, view]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const markDone = async (id: string) => {
    try {
      await api(`/student/cleaning/${id}/done`, { method: "POST" });
      toast.show("Marked as done. Thanks for confirming!", "success");
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  };

  const cancelCleaning = async (id: string) => {
    try {
      await api(`/student/cleaning/${id}/cancel`, { method: "POST" });
      toast.show("Request cancelled", "info");
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    if (type === "cleaning") {
      return (
        <Card style={{ gap: S.sm }} testID={`cleaning-card-${item.id}`}>
          <View style={styles.rowBetween}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="sparkles-outline" size={16} color={C.brand} />
              <Text style={styles.itemTitle}>Room {item.room_number}</Text>
            </View>
            <StatusBadge status={item.status} testID={`cleaning-status-${item.id}`} />
          </View>
          <Text style={styles.meta}>Slot: {item.preferred_time_slot}</Text>
          {item.notes ? <Text style={styles.meta}>Notes: {item.notes}</Text> : null}
          {item.status === "scheduled" && (item.scheduled_note || item.assigned_staff_name) ? (
            <Text style={[styles.meta, { color: C.info }]}>
              {item.assigned_staff_name ? `Staff: ${item.assigned_staff_name}. ` : ""}{item.scheduled_note}
            </Text>
          ) : null}
          <Text style={styles.metaSmall}>Requested {fmtDate(item.created_at)}</Text>
          {item.status === "scheduled" && (
            <Btn title="Mark as Done" icon="checkmark-circle-outline" variant="success" small onPress={() => markDone(item.id)} testID={`mark-done-button-${item.id}`} />
          )}
          {item.status === "requested" && (
            <Btn title="Cancel Request" variant="ghost" small onPress={() => cancelCleaning(item.id)} testID={`cancel-cleaning-${item.id}`} />
          )}
        </Card>
      );
    }
    if (type === "complaint") {
      return (
        <Pressable testID={`complaint-card-${item.id}`} onPress={() => router.push(`/complaint/${item.id}`)}>
          <Card style={{ gap: S.sm }}>
            <View style={styles.rowBetween}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <Ionicons name={(CATEGORY_ICONS[item.category] || "build-outline") as any} size={16} color={C.brand} />
                <Text style={styles.itemTitle} numberOfLines={1}>{item.description}</Text>
              </View>
              <StatusBadge status={item.status} testID={`complaint-status-${item.id}`} />
            </View>
            <Text style={styles.meta}>{item.category.replace("-", "/")} · {item.urgency} urgency</Text>
            {view === "history" && item.student_feedback_rating ? (
              <View style={{ flexDirection: "row", gap: 2 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Ionicons key={n} name={item.student_feedback_rating >= n ? "star" : "star-outline"} size={13} color={C.warning} />
                ))}
              </View>
            ) : null}
            <Text style={styles.metaSmall}>Filed {fmtDate(item.created_at)} · Tap for timeline</Text>
          </Card>
        </Pressable>
      );
    }
    return (
      <Card style={{ gap: S.sm }} testID={`change-card-${item.id}`}>
        <View style={styles.rowBetween}>
          <Text style={styles.itemTitle}>{item.request_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</Text>
          <StatusBadge status={item.status} testID={`change-status-${item.id}`} />
        </View>
        <Text style={styles.meta}>{item.current_value} → {item.requested_value}</Text>
        <Text style={styles.meta}>Reason: {item.reason}</Text>
        {item.admin_notes ? <Text style={[styles.meta, { color: item.status === "rejected" ? C.error : C.success }]}>Reviewer note: {item.admin_notes}</Text> : null}
        <Text style={styles.metaSmall}>{fmtDate(item.created_at)}</Text>
      </Card>
    );
  };

  const cleaningBlocked = type === "cleaning" && availability && !availability.can_request;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Text style={styles.headerTitle}>My Requests</Text>
        <View style={styles.chipRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm, paddingRight: S.lg }}>
            {TYPES.map((t) => (
              <Pressable
                key={t.key}
                testID={`request-type-chip-${t.key}`}
                onPress={() => setType(t.key)}
                style={[styles.chip, type === t.key && styles.chipActive]}
              >
                <Text style={[styles.chipText, type === t.key && { color: C.brand }]}>{t.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <View style={styles.segment}>
          {(["active", "history"] as const).map((v) => (
            <Pressable key={v} testID={`view-toggle-${v}`} onPress={() => setView(v)} style={[styles.segmentItem, view === v && styles.segmentActive]}>
              <Text style={[styles.segmentText, view === v && { color: C.brand }]}>{v === "active" ? "Active" : "History"}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {type === "cleaning" && view === "active" && availability && (
        <View style={[styles.banner, { backgroundColor: cleaningBlocked ? C.errorBg : C.infoBg }]} testID="cleaning-window-banner">
          <Ionicons name="time-outline" size={15} color={cleaningBlocked ? C.error : C.info} />
          <Text style={{ flex: 1, fontSize: 12, color: cleaningBlocked ? C.error : C.info }}>
            {cleaningBlocked ? availability.reason : `Requests open ${availability.allowed_hours} · ${2 - (availability.rate?.used || 0)}/2 remaining this window`}
          </Text>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: S.lg, gap: S.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={
          <Empty
            icon={view === "history" ? "archive-outline" : "file-tray-outline"}
            text={view === "history" ? "No past requests yet" : `No active ${type === "complaint" ? "complaints" : type === "cleaning" ? "cleaning requests" : "change requests"}`}
            testID="requests-empty"
          />
        }
      />

      {view === "active" && !(type === "cleaning" && cleaningBlocked) && (
        <Pressable
          testID="new-request-fab"
          onPress={() => router.push(`/new-request?type=${type}` as any)}
          style={[styles.fab, { bottom: insets.bottom + 20 }]}
        >
          <Ionicons name="add" size={26} color="#FFF" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  header: { backgroundColor: C.brand, paddingHorizontal: S.lg, paddingBottom: S.md, gap: S.md },
  headerTitle: { color: "#FFF", fontSize: 20, fontWeight: "800" },
  chipRow: { height: 40 },
  chip: {
    height: 36, paddingHorizontal: 16, borderRadius: R.pill, backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  chipActive: { backgroundColor: "#FFF" },
  chipText: { color: "#D5DEEC", fontSize: 13, fontWeight: "700" },
  segment: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: R.sm + 2, padding: 3 },
  segmentItem: { flex: 1, paddingVertical: 7, borderRadius: R.sm, alignItems: "center" },
  segmentActive: { backgroundColor: "#FFF" },
  segmentText: { fontSize: 12.5, fontWeight: "700", color: "#D5DEEC" },
  banner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: S.lg, paddingVertical: S.sm },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: S.sm },
  itemTitle: { fontSize: 14, fontWeight: "700", color: C.onSurface, flexShrink: 1 },
  meta: { fontSize: 12.5, color: C.onSurfaceSecondary },
  metaSmall: { fontSize: 11, color: C.muted },
  fab: {
    position: "absolute", right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.brand, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
});
