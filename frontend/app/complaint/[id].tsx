import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { Btn, Card, Input, StatusBadge } from "@/src/components/UI";
import { useAuth } from "@/src/context/AuthContext";
import { C, R, S, STATUS_COLORS, URGENCY_COLORS, CATEGORY_ICONS, fmtDate } from "@/src/theme";

const NEXT_STATUSES = ["acknowledged", "in-progress", "resolved", "escalated"];

export default function ComplaintDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const [c, setC] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updateModal, setUpdateModal] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [note, setNote] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api(`/student/complaints/${id}`);
      setC(data);
      setAssignedTo(data.assigned_to || "");
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const submitUpdate = async () => {
    if (!newStatus) return toast.show("Pick a status", "error");
    setBusy(true);
    try {
      await api(`/warden/complaints/${id}`, {
        method: "PATCH",
        body: { status: newStatus, note, assigned_to: assignedTo, resolution_note: newStatus === "resolved" ? note : undefined },
      });
      toast.show("Complaint updated", "success");
      setUpdateModal(false);
      setNote("");
      setNewStatus("");
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const rate = async (rating: number) => {
    try {
      await api(`/student/complaints/${id}/rate`, { method: "POST", body: { rating } });
      toast.show("Thanks for your feedback!", "success");
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={C.brand} /></View>;
  }
  if (!c) {
    return <View style={styles.center}><Text style={{ color: C.muted }}>Complaint not found</Text></View>;
  }

  const isWarden = user?.role === "warden" || user?.role === "admin";
  const isOwner = user?.role === "student" && c.student_id === user.id;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="complaint-back-button" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Complaint Detail</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + 100, gap: S.lg }}>
        <Card style={{ gap: S.md }}>
          <View style={styles.rowBetween}>
            <View style={styles.catRow}>
              <View style={styles.catIcon}>
                <Ionicons name={(CATEGORY_ICONS[c.category] || "build-outline") as any} size={18} color={C.brand} />
              </View>
              <Text style={styles.catText}>{c.category.replace("-", " / ")}</Text>
            </View>
            <StatusBadge status={c.status} testID="complaint-detail-status-badge" />
          </View>
          <Text style={styles.desc}>{c.description}</Text>
          <View style={styles.metaRow}>
            <View style={[styles.urgencyPill, { backgroundColor: (URGENCY_COLORS[c.urgency] || URGENCY_COLORS.low).bg }]}>
              <Text style={{ color: (URGENCY_COLORS[c.urgency] || URGENCY_COLORS.low).fg, fontSize: 11, fontWeight: "700" }}>
                {c.urgency.toUpperCase()} URGENCY
              </Text>
            </View>
            <Text style={styles.metaText}>Room {c.room_number} · {fmtDate(c.created_at)}</Text>
          </View>
          {isWarden && (
            <Text style={styles.metaText}>Raised by {c.student_name} ({c.registration_number})</Text>
          )}
          {c.assigned_to ? <Text style={styles.metaText}>Assigned to: {c.assigned_to}</Text> : null}
        </Card>

        <Card style={{ gap: S.sm }}>
          <Text style={styles.sectionTitle}>Status Timeline</Text>
          {[...(c.status_history || [])].reverse().map((h: any, i: number) => {
            const col = STATUS_COLORS[h.status] || { fg: C.muted, bg: C.surfaceTertiary };
            return (
              <View key={i} style={styles.timelineRow}>
                <View style={styles.timelineLeft}>
                  <View style={[styles.timelineDot, { backgroundColor: col.fg }]} />
                  {i < c.status_history.length - 1 && <View style={styles.timelineLine} />}
                </View>
                <View style={{ flex: 1, paddingBottom: S.md }}>
                  <Text style={[styles.timelineStatus, { color: col.fg }]}>{h.status.replace(/-/g, " ")}</Text>
                  <Text style={styles.timelineTime}>{fmtDate(h.timestamp)}</Text>
                  {h.note ? <Text style={styles.timelineNote}>{h.note}</Text> : null}
                </View>
              </View>
            );
          })}
        </Card>

        {c.resolution_note ? (
          <Card style={{ gap: 6, backgroundColor: C.successBg, borderColor: C.success }}>
            <Text style={[styles.sectionTitle, { color: C.success }]}>Resolution</Text>
            <Text style={{ color: C.onSurfaceSecondary, fontSize: 14 }}>{c.resolution_note}</Text>
          </Card>
        ) : null}

        {isOwner && c.status === "resolved" && (
          <Card style={{ gap: S.md }}>
            <Text style={styles.sectionTitle}>
              {c.student_feedback_rating ? `Your rating: ${c.student_feedback_rating}/5` : "How satisfied are you with the resolution?"}
            </Text>
            <View style={{ flexDirection: "row", gap: S.md, justifyContent: "center" }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} testID={`rate-star-${n}`} onPress={() => rate(n)} disabled={!!c.student_feedback_rating}>
                  <Ionicons
                    name={(c.student_feedback_rating || 0) >= n ? "star" : "star-outline"}
                    size={32}
                    color={(c.student_feedback_rating || 0) >= n ? C.warning : C.mutedLight}
                  />
                </Pressable>
              ))}
            </View>
          </Card>
        )}

        {isWarden && c.status !== "resolved" && (
          <Btn title="Update Status" icon="create-outline" onPress={() => setUpdateModal(true)} testID="update-complaint-button" />
        )}
      </ScrollView>

      <Modal visible={updateModal} transparent animationType="slide" onRequestClose={() => setUpdateModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + S.xl }]}>
            <Text style={styles.sectionTitle}>Update Complaint</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
              {NEXT_STATUSES.map((s) => (
                <Pressable
                  key={s}
                  testID={`status-option-${s}`}
                  onPress={() => setNewStatus(s)}
                  style={[styles.statusOpt, newStatus === s && { backgroundColor: C.brand, borderColor: C.brand }]}
                >
                  <Text style={{ color: newStatus === s ? "#FFF" : C.onSurfaceSecondary, fontSize: 13, fontWeight: "600", textTransform: "capitalize" }}>
                    {s.replace("-", " ")}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Input testID="update-note-input" label="Note (shown on the timeline)" placeholder="e.g. Electrician assigned" value={note} onChangeText={setNote} />
            <Input testID="assigned-to-input" label="Assign to (optional)" placeholder="Staff name" value={assignedTo} onChangeText={setAssignedTo} />
            <Btn title="Save Update" onPress={submitUpdate} loading={busy} testID="save-complaint-update-button" />
            <Btn title="Cancel" variant="ghost" onPress={() => setUpdateModal(false)} testID="cancel-complaint-update-button" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  header: {
    backgroundColor: C.brand, flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", paddingHorizontal: S.md, paddingBottom: S.md,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#FFF", fontSize: 17, fontWeight: "700" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  catRow: { flexDirection: "row", alignItems: "center", gap: S.sm, flexShrink: 1 },
  catIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.brandTertiary, alignItems: "center", justifyContent: "center" },
  catText: { fontSize: 15, fontWeight: "700", color: C.onSurface, textTransform: "capitalize" },
  desc: { fontSize: 14, color: C.onSurfaceSecondary, lineHeight: 20 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: S.sm, flexWrap: "wrap" },
  urgencyPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.pill },
  metaText: { fontSize: 12, color: C.muted },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: C.onSurface },
  timelineRow: { flexDirection: "row", gap: S.md },
  timelineLeft: { alignItems: "center", width: 16 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  timelineLine: { flex: 1, width: 2, backgroundColor: C.border, marginTop: 2 },
  timelineStatus: { fontSize: 14, fontWeight: "700", textTransform: "capitalize" },
  timelineTime: { fontSize: 11, color: C.muted, marginTop: 1 },
  timelineNote: { fontSize: 13, color: C.onSurfaceSecondary, marginTop: 3 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, padding: S.xl, gap: S.lg },
  statusOpt: {
    paddingHorizontal: 14, height: 36, borderRadius: R.pill, borderWidth: 1,
    borderColor: C.border, backgroundColor: C.card, alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
});
