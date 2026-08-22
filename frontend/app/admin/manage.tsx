import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { Btn, Card, Chip, Input, SectionTitle } from "@/src/components/UI";
import { C, R, S } from "@/src/theme";

export default function AdminManage() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [blocks, setBlocks] = useState<any[]>([]);
  const [messPlans, setMessPlans] = useState<any[]>([]);
  const [selBlock, setSelBlock] = useState<any>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  // add block modal
  const [blockModal, setBlockModal] = useState(false);
  const [bName, setBName] = useState("");
  const [bCode, setBCode] = useState("");
  const [bGender, setBGender] = useState("");
  // bulk rooms modal
  const [roomModal, setRoomModal] = useState(false);
  const [rPrefix, setRPrefix] = useState("");
  const [rStart, setRStart] = useState("101");
  const [rCount, setRCount] = useState("10");
  const [rType, setRType] = useState("double");
  const [rAc, setRAc] = useState("Non-AC");
  // mess modal
  const [messModal, setMessModal] = useState(false);
  const [mName, setMName] = useState("");
  const [mLoc, setMLoc] = useState("");
  // allocate modal
  const [allocModal, setAllocModal] = useState(false);
  const [aReg, setAReg] = useState("");
  const [aBlockId, setABlockId] = useState<string | null>(null);
  const [aRooms, setARooms] = useState<any[]>([]);
  const [aRoomId, setARoomId] = useState<string | null>(null);
  const [aMessId, setAMessId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [bs, ms] = await Promise.all([api("/admin/blocks"), api("/admin/mess-plans")]);
      setBlocks(bs);
      setMessPlans(ms);
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openBlock = async (b: any) => {
    setSelBlock(b);
    try {
      setRooms(await api(`/admin/rooms?block_id=${b.id}`));
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  };

  const addBlock = async () => {
    if (!bName.trim() || !bCode.trim()) return toast.show("Name and code are required", "error");
    setBusy(true);
    try {
      await api("/admin/blocks", { method: "POST", body: { name: bName.trim(), code: bCode.trim(), gender: bGender.trim() || null } });
      toast.show("Block created", "success");
      setBlockModal(false);
      setBName(""); setBCode(""); setBGender("");
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally { setBusy(false); }
  };

  const addRooms = async () => {
    if (!selBlock || !rPrefix.trim()) return toast.show("Room prefix required (e.g. H-)", "error");
    setBusy(true);
    try {
      const cap = rType === "single" ? 1 : rType === "double" ? 2 : rType === "triple" ? 3 : 4;
      const res = await api("/admin/rooms/bulk", {
        method: "POST",
        body: { block_id: selBlock.id, prefix: rPrefix.trim(), start: parseInt(rStart) || 101, count: parseInt(rCount) || 1, room_type: rType, ac_status: rAc, capacity: cap },
      });
      toast.show(`${res.created} rooms created`, "success");
      setRoomModal(false);
      openBlock(selBlock);
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally { setBusy(false); }
  };

  const addMess = async () => {
    if (!mName.trim() || !mLoc.trim()) return toast.show("Name and location required", "error");
    setBusy(true);
    try {
      await api("/admin/mess-plans", { method: "POST", body: { name: mName.trim(), mess_hall_location: mLoc.trim() } });
      toast.show("Mess plan added", "success");
      setMessModal(false);
      setMName(""); setMLoc("");
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally { setBusy(false); }
  };

  const pickAllocBlock = async (bid: string) => {
    setABlockId(bid);
    setARoomId(null);
    try {
      setARooms(await api(`/admin/rooms?block_id=${bid}`));
    } catch { /* noop */ }
  };

  const allocate = async () => {
    if (!aReg.trim() || !aBlockId || !aRoomId || !aMessId) return toast.show("Fill all allocation fields", "error");
    setBusy(true);
    try {
      await api("/admin/allocate", { method: "POST", body: { registration_number: aReg.trim(), block_id: aBlockId, room_id: aRoomId, mess_plan_id: aMessId } });
      toast.show("Student allocated successfully", "success");
      setAllocModal(false);
      setAReg("");
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally { setBusy(false); }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Text style={styles.headerTitle}>Manage Hostel</Text>
      </View>
      <KeyboardAwareScrollView contentContainerStyle={{ padding: S.lg, gap: S.xl, paddingBottom: 60 }} bottomOffset={24}>
        <Btn title="Allocate Student to Room" icon="person-add-outline" onPress={() => setAllocModal(true)} testID="open-allocate-modal-button" />

        <View>
          <SectionTitle
            title="Hostel Blocks"
            right={<Pressable testID="add-block-button" onPress={() => setBlockModal(true)}><Ionicons name="add-circle" size={26} color={C.brand} /></Pressable>}
          />
          <View style={{ gap: S.md }}>
            {blocks.map((b) => (
              <Pressable key={b.id} testID={`block-card-${b.code}`} onPress={() => openBlock(b)}>
                <Card style={{ gap: 6 }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.blockName}>{b.name}</Text>
                    <Text style={styles.meta}>{b.occupied}/{b.capacity} beds</Text>
                  </View>
                  <Text style={styles.meta}>{b.room_count} rooms{b.gender ? ` · ${b.gender}` : ""}{b.wardens?.length ? ` · Warden: ${b.wardens.join(", ")}` : " · No warden"}</Text>
                  {selBlock?.id === b.id && (
                    <View style={{ gap: S.sm, marginTop: S.sm }}>
                      <Btn title="Bulk Add Rooms" small variant="secondary" icon="add-outline" onPress={() => setRoomModal(true)} testID="bulk-add-rooms-button" />
                      <View style={styles.roomGrid}>
                        {rooms.map((r) => (
                          <View key={r.id} style={[styles.roomPill, r.current_occupant_ids.length >= r.capacity && { backgroundColor: C.errorBg }]}>
                            <Text style={styles.roomText}>{r.room_number}</Text>
                            <Text style={styles.roomMeta}>{r.current_occupant_ids.length}/{r.capacity} · {r.ac_status}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </Card>
              </Pressable>
            ))}
          </View>
        </View>

        <View>
          <SectionTitle
            title="Mess Plans"
            right={<Pressable testID="add-mess-button" onPress={() => setMessModal(true)}><Ionicons name="add-circle" size={26} color={C.brand} /></Pressable>}
          />
          <Card style={{ gap: S.md }}>
            {messPlans.map((m, i) => (
              <React.Fragment key={m.id}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.rowBetween}>
                  <Text style={styles.blockName}>{m.name}</Text>
                  <Text style={styles.meta}>{m.mess_hall_location}</Text>
                </View>
              </React.Fragment>
            ))}
          </Card>
        </View>
      </KeyboardAwareScrollView>

      {/* Add block modal */}
      <Modal visible={blockModal} transparent animationType="slide" onRequestClose={() => setBlockModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + S.xl }]}>
            <Text style={styles.sheetTitle}>New Block</Text>
            <Input testID="block-name-input" label="Name" placeholder="e.g. J Block" value={bName} onChangeText={setBName} />
            <Input testID="block-code-input" label="Code" placeholder="e.g. J Block" value={bCode} onChangeText={setBCode} />
            <Input testID="block-gender-input" label="Gender designation (optional)" placeholder="Men / Women" value={bGender} onChangeText={setBGender} />
            <Btn title="Create Block" onPress={addBlock} loading={busy} testID="create-block-button" />
            <Btn title="Cancel" variant="ghost" onPress={() => setBlockModal(false)} testID="cancel-block-button" />
          </View>
        </View>
      </Modal>

      {/* Bulk rooms modal */}
      <Modal visible={roomModal} transparent animationType="slide" onRequestClose={() => setRoomModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + S.xl }]}>
            <Text style={styles.sheetTitle}>Bulk Add Rooms — {selBlock?.code}</Text>
            <Input testID="room-prefix-input" label="Room number prefix" placeholder="e.g. J-" value={rPrefix} onChangeText={setRPrefix} />
            <View style={{ flexDirection: "row", gap: S.md }}>
              <View style={{ flex: 1 }}>
                <Input testID="room-start-input" label="Start" value={rStart} onChangeText={setRStart} keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Input testID="room-count-input" label="Count" value={rCount} onChangeText={setRCount} keyboardType="number-pad" />
              </View>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
              {["single", "double", "triple", "quad"].map((t) => (
                <Chip key={t} label={t} selected={rType === t} onPress={() => setRType(t)} testID={`room-type-${t}`} />
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: S.sm }}>
              {["AC", "Non-AC"].map((t) => (
                <Chip key={t} label={t} selected={rAc === t} onPress={() => setRAc(t)} testID={`room-ac-${t}`} />
              ))}
            </View>
            <Btn title="Create Rooms" onPress={addRooms} loading={busy} testID="create-rooms-button" />
            <Btn title="Cancel" variant="ghost" onPress={() => setRoomModal(false)} testID="cancel-rooms-button" />
          </View>
        </View>
      </Modal>

      {/* Mess modal */}
      <Modal visible={messModal} transparent animationType="slide" onRequestClose={() => setMessModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + S.xl }]}>
            <Text style={styles.sheetTitle}>New Mess Plan</Text>
            <Input testID="mess-name-input" label="Name" placeholder="e.g. Special" value={mName} onChangeText={setMName} />
            <Input testID="mess-location-input" label="Mess hall location" placeholder="e.g. Food Court Annex" value={mLoc} onChangeText={setMLoc} />
            <Btn title="Add Mess Plan" onPress={addMess} loading={busy} testID="create-mess-button" />
            <Btn title="Cancel" variant="ghost" onPress={() => setMessModal(false)} testID="cancel-mess-button" />
          </View>
        </View>
      </Modal>

      {/* Allocate modal */}
      <Modal visible={allocModal} transparent animationType="slide" onRequestClose={() => setAllocModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + S.xl, maxHeight: "88%" }]}>
            <KeyboardAwareScrollView contentContainerStyle={{ gap: S.lg }} bottomOffset={24}>
              <Text style={styles.sheetTitle}>Allocate Student</Text>
              <Input testID="alloc-regno-input" label="Registration Number" placeholder="e.g. 23BCE1003" value={aReg} onChangeText={setAReg} autoCapitalize="characters" />
              <Text style={styles.label}>Block</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
                {blocks.map((b) => (
                  <Chip key={b.id} label={b.code} selected={aBlockId === b.id} onPress={() => pickAllocBlock(b.id)} testID={`alloc-block-${b.code}`} />
                ))}
              </View>
              {aBlockId && (
                <>
                  <Text style={styles.label}>Room</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
                    {aRooms.filter((r) => r.current_occupant_ids.length < r.capacity).map((r) => (
                      <Chip key={r.id} label={`${r.room_number} (${r.current_occupant_ids.length}/${r.capacity})`} selected={aRoomId === r.id} onPress={() => setARoomId(r.id)} testID={`alloc-room-${r.room_number}`} />
                    ))}
                  </View>
                </>
              )}
              <Text style={styles.label}>Mess Plan</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
                {messPlans.map((m) => (
                  <Chip key={m.id} label={m.name} selected={aMessId === m.id} onPress={() => setAMessId(m.id)} testID={`alloc-mess-${m.name}`} />
                ))}
              </View>
              <Btn title="Allocate" onPress={allocate} loading={busy} testID="confirm-allocate-button" />
              <Btn title="Cancel" variant="ghost" onPress={() => setAllocModal(false)} testID="cancel-allocate-button" />
            </KeyboardAwareScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  header: { backgroundColor: C.brand, paddingHorizontal: S.lg, paddingBottom: S.lg },
  headerTitle: { color: "#FFF", fontSize: 20, fontWeight: "800" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  blockName: { fontSize: 15, fontWeight: "800", color: C.onSurface },
  meta: { fontSize: 12, color: C.muted },
  label: { fontSize: 13, fontWeight: "600", color: C.onSurfaceSecondary },
  divider: { height: 1, backgroundColor: C.divider },
  roomGrid: { flexDirection: "row", flexWrap: "wrap", gap: S.sm },
  roomPill: { backgroundColor: C.surfaceTertiary, borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center" },
  roomText: { fontSize: 12, fontWeight: "800", color: C.onSurface },
  roomMeta: { fontSize: 9.5, color: C.muted },
  modalOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, padding: S.xl, gap: S.lg },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: C.onSurface },
});
