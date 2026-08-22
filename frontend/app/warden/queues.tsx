import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ScrollView, Modal, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { Btn, Card, Chip, Empty, Input, StatusBadge } from "@/src/components/UI";
import { C, R, S, CATEGORY_ICONS, URGENCY_COLORS, fmtDate } from "@/src/theme";

const TABS = [
  { key: "cleaning", label: "Cleaning" },
  { key: "complaints", label: "Complaints" },
  { key: "changes", label: "Changes" },
];
const COMPLAINT_FILTERS = ["all", "submitted", "acknowledged", "in-progress", "resolved", "escalated"];

export default function WardenQueues() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState(params.tab || "cleaning");
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  // schedule modal
  const [scheduleFor, setScheduleFor] = useState<any>(null);
  const [schedNote, setSchedNote] = useState("");
  const [schedStaff, setSchedStaff] = useState("");
  // reject modal
  const [rejectFor, setRejectFor] = useState<any>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      if (tab === "cleaning") setItems(await api("/warden/cleaning"));
      else if (tab === "complaints") setItems(await api(`/warden/complaints${filter !== "all" ? `?status=${filter}` : ""}`));
      else setItems(await api("/warden/change-requests?status=pending"));
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  }, [tab, filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doSchedule = async () => {
    setBusy(true);
    try {
      await api(`/warden/cleaning/${scheduleFor.id}/schedule`, { method: "POST", body: { scheduled_note: schedNote, assigned_staff_name: schedStaff } });
      toast.show("Scheduled. Student will confirm completion.", "success");
      setScheduleFor(null);
      setSchedNote("");
      setSchedStaff("");
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const review = async (req: any, action: "approve" | "reject", notes = "") => {
    setBusy(true);
    try {
      await api(`/warden/change-requests/${req.id}/review`, { method: "POST", body: { action, admin_notes: notes } });
      toast.show(action === "approve" ? "Approved — allocation updated automatically" : "Request rejected", "success");
      setRejectFor(null);
      setRejectNote("");
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    if (tab === "cleaning") {
      const awaiting = item.status === "scheduled";
      return (
        <Card style={{ gap: S.sm, borderLeftWidth: 3, borderLeftColor: awaiting ? C.info : C.warning }} testID={`queue-cleaning-${item.id}`}>
          <View style={styles.rowBetween}>
            <Text style={styles.itemTitle}>Room {item.room_number} · {item.student_name}</Text>
            <StatusBadge status={item.status} />
          </View>
          <Text style={styles.meta}>Slot: {item.preferred_time_slot}</Text>
          {item.notes ? <Text style={styles.meta}>Notes: {item.notes}</Text> : null}
          <Text style={styles.metaSmall}>{fmtDate(item.created_at)}</Text>
          {awaiting ? (
            <View style={styles.awaitBox}>
              <Ionicons name="hourglass-outline" size={14} color={C.info} />
              <Text style={{ fontSize: 12, color: C.info, flex: 1 }}>Scheduled — awaiting student&apos;s &quot;Mark as Done&quot; confirmation</Text>
            </View>
          ) : (
            <Btn title="Schedule Cleaning" small icon="calendar-outline" onPress={() => setScheduleFor(item)} testID={`schedule-button-${item.id}`} />
          )}
        </Card>
      );
    }
    if (tab === "complaints") {
      const u = URGENCY_COLORS[item.urgency] || URGENCY_COLORS.low;
      return (
        <Pressable testID={`queue-complaint-${item.id}`} onPress={() => router.push(`/complaint/${item.id}`)}>
          <Card style={{ gap: S.sm }}>
            <View style={styles.rowBetween}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <Ionicons name={(CATEGORY_ICONS[item.category] || "build-outline") as any} size={16} color={C.brand} />
                <Text style={styles.itemTitle} numberOfLines={1}>{item.description}</Text>
              </View>
              <StatusBadge status={item.status} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm, flexWrap: "wrap" }}>
              <View style={[styles.urgPill, { backgroundColor: u.bg }]}>
                <Text style={{ fontSize: 10, fontWeight: "800", color: u.fg }}>{item.urgency.toUpperCase()}</Text>
              </View>
              <Text style={styles.meta}>{item.room_number} · {item.student_name}</Text>
            </View>
            <Text style={styles.metaSmall}>{fmtDate(item.created_at)} · Tap to manage</Text>
          </Card>
        </Pressable>
      );
    }
    return (
      <Card style={{ gap: S.sm }} testID={`queue-change-${item.id}`}>
        <View style={styles.rowBetween}>
          <Text style={styles.itemTitle}>{item.request_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</Text>
          <StatusBadge status={item.status} />
        </View>
        <Text style={styles.meta}>{item.student_name} ({item.registration_number})</Text>
        <Text style={styles.meta}>{item.current_value} → {item.requested_value}</Text>
        <Text style={styles.meta}>Reason: {item.reason}</Text>
        <Text style={styles.metaSmall}>{fmtDate(item.created_at)}</Text>
        {item.status === "pending" && (
          <View style={{ flexDirection: "row", gap: S.sm }}>
            <View style={{ flex: 1 }}>
              <Btn title="Approve" variant="success" small onPress={() => review(item, "approve")} testID={`approve-change-${item.id}`} />
            </View>
            <View style={{ flex: 1 }}>
              <Btn title="Reject" variant="danger" small onPress={() => setRejectFor(item)} testID={`reject-change-${item.id}`} />
            </View>
          </View>
        )}
      </Card>
    );
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Text style={styles.headerTitle}>Queues</Text>
        <View style={{ height: 40 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
            {TABS.map((t) => (
              <Pressable key={t.key} testID={`queue-tab-${t.key}`} onPress={() => setTab(t.key)} style={[styles.tabChip, tab === t.key && { backgroundColor: "#FFF" }]}>
                <Text style={{ color: tab === t.key ? C.brand : "#D5DEEC", fontWeight: "700", fontSize: 13 }}>{t.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>

      {tab === "complaints" && (
        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm, paddingHorizontal: S.lg }}>
            {COMPLAINT_FILTERS.map((f) => (
              <Chip key={f} label={f === "all" ? "All" : f.replace("-", " ")} selected={filter === f} onPress={() => setFilter(f)} testID={`complaint-filter-${f}`} />
            ))}
          </ScrollView>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: S.lg, gap: S.md, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={<Empty icon="checkmark-done-outline" text="Nothing pending here. All caught up!" testID="queue-empty" />}
      />

      {/* Schedule modal */}
      <Modal visible={!!scheduleFor} transparent animationType="slide" onRequestClose={() => setScheduleFor(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + S.xl }]}>
            <Text style={styles.sheetTitle}>Schedule Cleaning</Text>
            <Text style={styles.meta}>Room {scheduleFor?.room_number} · {scheduleFor?.student_name} · Slot: {scheduleFor?.preferred_time_slot}</Text>
            <Input testID="schedule-note-input" label="Note for student (optional)" placeholder="e.g. Staff will arrive around 4:30 PM" value={schedNote} onChangeText={setSchedNote} />
            <Input testID="schedule-staff-input" label="Assigned staff (optional)" placeholder="Staff name" value={schedStaff} onChangeText={setSchedStaff} />
            <Btn title="Confirm Schedule" onPress={doSchedule} loading={busy} testID="confirm-schedule-button" />
            <Btn title="Cancel" variant="ghost" onPress={() => setScheduleFor(null)} testID="cancel-schedule-button" />
          </View>
        </View>
      </Modal>

      {/* Reject modal */}
      <Modal visible={!!rejectFor} transparent animationType="slide" onRequestClose={() => setRejectFor(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + S.xl }]}>
            <Text style={styles.sheetTitle}>Reject Request</Text>
            <Text style={styles.meta}>{rejectFor?.student_name}: {rejectFor?.current_value} → {rejectFor?.requested_value}</Text>
            <Input testID="reject-note-input" label="Reason for rejection (required)" placeholder="Explain why this request is rejected" value={rejectNote} onChangeText={setRejectNote} multiline />
            <Btn title="Reject Request" variant="danger" onPress={() => {
              if (!rejectNote.trim()) return toast.show("A note is required when rejecting", "error");
              review(rejectFor, "reject", rejectNote.trim());
            }} loading={busy} testID="confirm-reject-button" />
            <Btn title="Cancel" variant="ghost" onPress={() => setRejectFor(null)} testID="cancel-reject-button" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  header: { backgroundColor: C.brand, paddingHorizontal: S.lg, paddingBottom: S.md, gap: S.md },
  headerTitle: { color: "#FFF", fontSize: 20, fontWeight: "800" },
  tabChip: {
    height: 36, paddingHorizontal: 16, borderRadius: R.pill, backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  filterRow: { height: 56, justifyContent: "center", backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.divider },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: S.sm },
  itemTitle: { fontSize: 14, fontWeight: "700", color: C.onSurface, flexShrink: 1 },
  meta: { fontSize: 12.5, color: C.onSurfaceSecondary },
  metaSmall: { fontSize: 11, color: C.muted },
  urgPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: R.pill },
  awaitBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.infoBg, borderRadius: R.sm, padding: S.sm },
  modalOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, padding: S.xl, gap: S.lg },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: C.onSurface },
});
