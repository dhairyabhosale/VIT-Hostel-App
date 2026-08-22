import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, Modal, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { Btn, Card, Chip, Empty, Input, StatusBadge } from "@/src/components/UI";
import { useAuth } from "@/src/context/AuthContext";
import { C, R, S, fmtDate } from "@/src/theme";

const SUBJECTS = ["Room change query", "Safety concern", "Mess / food", "Noise complaint", "General"];

export default function Threads() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const [threads, setThreads] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [newModal, setNewModal] = useState(false);
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setThreads(await api("/threads"));
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const create = async () => {
    if (!message.trim()) return toast.show("Write a message", "error");
    setBusy(true);
    try {
      const t = await api("/threads", { method: "POST", body: { subject, message: message.trim() } });
      setNewModal(false);
      setMessage("");
      router.push(`/thread/${t.id}`);
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="threads-back-button" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Warden Messages</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={threads}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: S.lg, gap: S.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={<Empty icon="chatbubbles-outline" text="No message threads yet. Start one for any query — room changes, safety concerns, or general questions." testID="threads-empty" />}
        renderItem={({ item }) => {
          const last = item.messages[item.messages.length - 1];
          return (
            <Pressable testID={`thread-card-${item.id}`} onPress={() => router.push(`/thread/${item.id}`)}>
              <Card style={{ gap: 6 }}>
                <View style={styles.rowBetween}>
                  <Text style={styles.subject} numberOfLines={1}>{item.subject}</Text>
                  <StatusBadge status={item.status} />
                </View>
                {user?.role !== "student" && (
                  <Text style={styles.meta}>From: {item.student_name}</Text>
                )}
                <Text style={styles.preview} numberOfLines={1}>{last?.sender_name}: {last?.text}</Text>
                <Text style={styles.meta}>{fmtDate(item.updated_at)}</Text>
              </Card>
            </Pressable>
          );
        }}
      />

      {user?.role === "student" && (
        <Pressable
          testID="new-thread-fab"
          onPress={() => setNewModal(true)}
          style={[styles.fab, { bottom: insets.bottom + 20 }]}
        >
          <Ionicons name="add" size={26} color="#FFF" />
        </Pressable>
      )}

      <Modal visible={newModal} transparent animationType="slide" onRequestClose={() => setNewModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + S.xl }]}>
            <Text style={styles.sheetTitle}>Contact Warden</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
              {SUBJECTS.map((s) => (
                <Chip key={s} label={s} selected={subject === s} onPress={() => setSubject(s)} testID={`subject-chip-${s.replace(/\s+/g, "-").toLowerCase()}`} />
              ))}
            </View>
            <Input
              testID="thread-first-message-input"
              label="Message"
              placeholder="Describe your query…"
              value={message}
              onChangeText={setMessage}
              multiline
            />
            <Btn title="Start Thread" onPress={create} loading={busy} testID="create-thread-button" />
            <Btn title="Cancel" variant="ghost" onPress={() => setNewModal(false)} testID="cancel-thread-button" />
          </View>
        </View>
      </Modal>
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
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: S.sm },
  subject: { fontSize: 15, fontWeight: "700", color: C.onSurface, flex: 1 },
  preview: { fontSize: 13, color: C.onSurfaceSecondary },
  meta: { fontSize: 11, color: C.muted },
  fab: {
    position: "absolute", right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.brand, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, padding: S.xl, gap: S.lg },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: C.onSurface },
});
