import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, Switch, ScrollView } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { Btn, Card, Chip, Empty, Input } from "@/src/components/UI";
import { C, R, S } from "@/src/theme";

const ROLE_FILTERS = ["all", "student", "warden", "admin"];
const CSV_SAMPLE = "24BCE2001,Rohan Verma,24bce2001@vitstudent.ac.in,9876500001\n24BCE2002,Aditi Singh,24bce2002@vitstudent.ac.in,9876500002";

export default function AdminUsers() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [roleFilter, setRoleFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  // import modal
  const [importModal, setImportModal] = useState(false);
  const [csvText, setCsvText] = useState("");
  // warden modal
  const [wardenModal, setWardenModal] = useState(false);
  const [wName, setWName] = useState("");
  const [wEmail, setWEmail] = useState("");
  const [wPhone, setWPhone] = useState("");
  const [wPassword, setWPassword] = useState("");
  const [wBlocks, setWBlocks] = useState<string[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (roleFilter !== "all") q.set("role", roleFilter);
      if (search.trim()) q.set("q", search.trim());
      setUsers(await api(`/admin/users?${q.toString()}`));
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  }, [roleFilter, search]);

  useFocusEffect(useCallback(() => {
    load();
    api("/admin/blocks").then(setBlocks).catch(() => {});
  }, [load]));

  const importRoster = async () => {
    if (!csvText.trim()) return toast.show("Paste CSV rows first", "error");
    setBusy(true);
    try {
      const res = await api("/admin/roster/import", { method: "POST", body: { csv_text: csvText } });
      toast.show(`Imported ${res.created} students (${res.skipped} skipped)${res.errors.length ? ` · ${res.errors.length} errors` : ""}`, "success");
      setImportModal(false);
      setCsvText("");
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally { setBusy(false); }
  };

  const createWarden = async () => {
    if (!wName.trim() || !wEmail.trim() || !wPassword) return toast.show("Name, email and password required", "error");
    setBusy(true);
    try {
      await api("/admin/wardens", { method: "POST", body: { name: wName.trim(), email: wEmail.trim(), phone: wPhone.trim(), password: wPassword, block_ids: wBlocks } });
      toast.show("Warden account created", "success");
      setWardenModal(false);
      setWName(""); setWEmail(""); setWPhone(""); setWPassword(""); setWBlocks([]);
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally { setBusy(false); }
  };

  const toggleActive = async (u: any, val: boolean) => {
    try {
      await api(`/admin/users/${u.id}`, { method: "PATCH", body: { active_status: val } });
      toast.show(val ? "Account activated" : "Account deactivated", "success");
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  };

  const resetAccess = async (u: any) => {
    try {
      const res = await api(`/admin/users/${u.id}/reset-access`, { method: "POST" });
      toast.show(res.message, "success");
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Text style={styles.headerTitle}>Users</Text>
        <View style={{ flexDirection: "row", gap: S.sm }}>
          <View style={{ flex: 1 }}>
            <Btn title="Import Roster" small variant="secondary" icon="cloud-upload-outline" onPress={() => setImportModal(true)} testID="open-import-modal-button" />
          </View>
          <View style={{ flex: 1 }}>
            <Btn title="New Warden" small variant="secondary" icon="person-add-outline" onPress={() => setWardenModal(true)} testID="open-warden-modal-button" />
          </View>
        </View>
        <Input
          testID="user-search-input"
          placeholder="Search name, reg no, email…"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={load}
          returnKeyType="search"
        />
      </View>

      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm, paddingHorizontal: S.lg }}>
          {ROLE_FILTERS.map((r) => (
            <Chip key={r} label={r === "all" ? "All" : r.charAt(0).toUpperCase() + r.slice(1) + "s"} selected={roleFilter === r} onPress={() => setRoleFilter(r)} testID={`role-filter-${r}`} />
          ))}
        </ScrollView>
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: S.lg, gap: S.md, paddingBottom: 60 }} bottomOffset={24}>
        {users.length === 0 && <Empty icon="people-outline" text="No users match" testID="users-empty" />}
        {users.map((u) => (
          <Card key={u.id} style={{ gap: S.sm }} testID={`user-card-${u.registration_number || u.email}`}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{u.name}</Text>
                <Text style={styles.meta}>{u.role.toUpperCase()}{u.registration_number ? ` · ${u.registration_number}` : ""} · {u.email}</Text>
                {u.role === "student" && (
                  <Text style={[styles.meta, { color: u.activated ? C.success : C.warning }]}>
                    {u.activated ? "Activated" : "Not activated (awaiting first login)"}
                  </Text>
                )}
              </View>
              {u.role !== "admin" && (
                <Switch testID={`active-toggle-${u.registration_number || u.email}`} value={!!u.active_status} onValueChange={(v) => toggleActive(u, v)} trackColor={{ true: C.brand }} />
              )}
            </View>
            {u.role === "student" && u.activated && (
              <Pressable testID={`reset-access-${u.registration_number}`} onPress={() => resetAccess(u)}>
                <Text style={{ color: C.error, fontSize: 12, fontWeight: "700" }}>Reset access (forces re-activation via OTP)</Text>
              </Pressable>
            )}
          </Card>
        ))}
      </KeyboardAwareScrollView>

      {/* Import modal */}
      <Modal visible={importModal} transparent animationType="slide" onRequestClose={() => setImportModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + S.xl }]}>
            <Text style={styles.sheetTitle}>Bulk Import Student Roster</Text>
            <Text style={styles.meta}>Paste CSV rows: reg number, full name, email, phone (one student per line)</Text>
            <Input
              testID="csv-input"
              placeholder={CSV_SAMPLE}
              value={csvText}
              onChangeText={setCsvText}
              multiline
              style={{ height: 140 }}
            />
            <Btn title="Import Students" onPress={importRoster} loading={busy} testID="confirm-import-button" />
            <Btn title="Cancel" variant="ghost" onPress={() => setImportModal(false)} testID="cancel-import-button" />
          </View>
        </View>
      </Modal>

      {/* Warden modal */}
      <Modal visible={wardenModal} transparent animationType="slide" onRequestClose={() => setWardenModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + S.xl, maxHeight: "88%" }]}>
            <KeyboardAwareScrollView contentContainerStyle={{ gap: S.lg }} bottomOffset={24}>
              <Text style={styles.sheetTitle}>Create Warden</Text>
              <Input testID="warden-name-input" label="Name" placeholder="e.g. Dr. Ramesh" value={wName} onChangeText={setWName} />
              <Input testID="warden-email-input" label="Email" placeholder="warden@vit.ac.in" value={wEmail} onChangeText={setWEmail} autoCapitalize="none" keyboardType="email-address" />
              <Input testID="warden-phone-input" label="Phone" placeholder="Contact number" value={wPhone} onChangeText={setWPhone} keyboardType="phone-pad" />
              <Input testID="warden-password-input" label="Password" placeholder="Min 6 characters" value={wPassword} onChangeText={setWPassword} secureTextEntry />
              <Text style={styles.label}>Assigned Blocks</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
                {blocks.map((b) => (
                  <Chip
                    key={b.id}
                    label={b.code}
                    selected={wBlocks.includes(b.id)}
                    onPress={() => setWBlocks((prev) => prev.includes(b.id) ? prev.filter((x) => x !== b.id) : [...prev, b.id])}
                    testID={`warden-block-${b.code}`}
                  />
                ))}
              </View>
              <Btn title="Create Warden" onPress={createWarden} loading={busy} testID="confirm-warden-button" />
              <Btn title="Cancel" variant="ghost" onPress={() => setWardenModal(false)} testID="cancel-warden-button" />
            </KeyboardAwareScrollView>
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
  filterRow: { height: 56, justifyContent: "center", backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.divider },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: S.sm },
  name: { fontSize: 14, fontWeight: "800", color: C.onSurface },
  meta: { fontSize: 12, color: C.muted, marginTop: 1 },
  label: { fontSize: 13, fontWeight: "600", color: C.onSurfaceSecondary },
  modalOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, padding: S.xl, gap: S.lg },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: C.onSurface },
});
