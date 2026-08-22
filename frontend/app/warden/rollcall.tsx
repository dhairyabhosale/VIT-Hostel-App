import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, TextInput, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { Btn, Empty } from "@/src/components/UI";
import { C, R, S } from "@/src/theme";

const STATUSES = [
  { key: "present", label: "P", color: C.success },
  { key: "absent", label: "A", color: C.error },
  { key: "on-leave", label: "L", color: C.warning },
];

export default function RollCall() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [blocks, setBlocks] = useState<any[]>([]);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [roster, setRoster] = useState<any[]>([]);
  const [date, setDate] = useState("");
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const loadBlocks = useCallback(async () => {
    try {
      const bs = await api("/warden/blocks");
      setBlocks(bs);
      if (bs.length && !blockId) setBlockId(bs[0].id);
    } catch { /* noop */ }
  }, [blockId]);

  const loadRoster = useCallback(async () => {
    if (!blockId) return;
    try {
      const res = await api(`/warden/roster?block_id=${blockId}`);
      setRoster(res.roster);
      setDate(res.date);
      const existing: Record<string, string> = {};
      res.roster.forEach((r: any) => { if (r.attendance_status) existing[r.student_id] = r.attendance_status; });
      setMarks(existing);
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  }, [blockId]);

  useFocusEffect(useCallback(() => { loadBlocks(); }, [loadBlocks]));
  useFocusEffect(useCallback(() => { loadRoster(); }, [loadRoster]));

  const setMark = (sid: string, status: string) => {
    setMarks((m) => ({ ...m, [sid]: status }));
    if (Platform.OS !== "web") Haptics.selectionAsync();
  };

  const markAllPresent = () => {
    const m: Record<string, string> = { ...marks };
    roster.forEach((r) => { if (!m[r.student_id]) m[r.student_id] = "present"; });
    setMarks(m);
    toast.show("All unmarked students set to Present. Adjust individual overrides, then submit.", "info");
  };

  const submit = async () => {
    if (!blockId) return;
    const entries = Object.entries(marks).map(([student_id, status]) => ({ student_id, status }));
    if (!entries.length) return toast.show("Mark at least one student", "error");
    setBusy(true);
    try {
      const res = await api("/warden/attendance", { method: "POST", body: { block_id: blockId, date, entries } });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(`Attendance saved for ${res.marked} students. Absent students notified.`, "success");
      loadRoster();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const filtered = roster.filter((r) =>
    !search ||
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.registration_number || "").toLowerCase().includes(search.toLowerCase()) ||
    r.room_number.toLowerCase().includes(search.toLowerCase())
  );

  const markedCount = Object.keys(marks).length;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Text style={styles.headerTitle}>Roll Call</Text>
        <Text style={styles.headerSub}>Night attendance · {date}</Text>
        {blocks.length > 1 && (
          <View style={{ height: 40 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
              {blocks.map((b) => (
                <Pressable key={b.id} testID={`rollcall-block-chip-${b.code}`} onPress={() => setBlockId(b.id)} style={[styles.blockChip, blockId === b.id && { backgroundColor: "#FFF" }]}>
                  <Text style={{ color: blockId === b.id ? C.brand : "#D5DEEC", fontWeight: "700", fontSize: 13 }}>{b.code}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color="#B6C4DE" />
          <TextInput
            testID="rollcall-search-input"
            style={styles.searchInput}
            placeholder="Search name, reg no, room…"
            placeholderTextColor="#8AA0C6"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(r) => r.student_id}
        contentContainerStyle={{ padding: S.lg, gap: S.sm, paddingBottom: 160 }}
        ListEmptyComponent={<Empty icon="people-outline" text="No students allocated in this block" testID="rollcall-empty" />}
        renderItem={({ item }) => {
          const current = marks[item.student_id];
          return (
            <View style={styles.row} testID={`rollcall-row-${item.registration_number}`}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name.split(" ").map((w: string) => w[0]).slice(0, 2).join("")}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.meta}>{item.registration_number} · {item.room_number}</Text>
              </View>
              <View style={styles.statusGroup}>
                {STATUSES.map((s) => (
                  <Pressable
                    key={s.key}
                    testID={`mark-${s.key}-${item.registration_number}`}
                    onPress={() => setMark(item.student_id, s.key)}
                    style={[styles.statusBtn, current === s.key && { backgroundColor: s.color, borderColor: s.color }]}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "800", color: current === s.key ? "#FFF" : C.muted }}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        }}
      />

      <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, S.md) }]}>
        <View style={{ flexDirection: "row", gap: S.md }}>
          <View style={{ flex: 1 }}>
            <Btn title="Mark All Present" variant="secondary" onPress={markAllPresent} testID="mark-all-present-button" />
          </View>
          <View style={{ flex: 1 }}>
            <Btn title={`Submit (${markedCount})`} onPress={submit} loading={busy} testID="submit-attendance-button" />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  header: { backgroundColor: C.brand, paddingHorizontal: S.lg, paddingBottom: S.md, gap: S.md },
  headerTitle: { color: "#FFF", fontSize: 20, fontWeight: "800" },
  headerSub: { color: "#B6C4DE", fontSize: 12 },
  blockChip: {
    height: 36, paddingHorizontal: 16, borderRadius: R.pill, backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: R.md, paddingHorizontal: S.md, height: 42,
  },
  searchInput: { flex: 1, color: "#FFF", fontSize: 14 },
  row: {
    flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: C.card,
    borderRadius: R.md, borderWidth: 1, borderColor: C.border, padding: S.md,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: C.brand, fontSize: 12, fontWeight: "800" },
  name: { fontSize: 14, fontWeight: "700", color: C.onSurface },
  meta: { fontSize: 11, color: C.muted, marginTop: 1 },
  statusGroup: { flexDirection: "row", gap: 6 },
  statusBtn: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: C.borderStrong,
    alignItems: "center", justifyContent: "center",
  },
  stickyBar: {
    position: "absolute", left: 0, right: 0, bottom: 0, padding: S.lg,
    backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border,
  },
});
