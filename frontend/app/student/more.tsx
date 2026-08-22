import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Modal, Linking, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, TOKEN_KEY, BIO_TOKEN_KEY } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { Btn, Card, Input, SectionTitle } from "@/src/components/UI";
import { useAuth } from "@/src/context/AuthContext";
import { C, R, S } from "@/src/theme";
import { storage } from "@/src/utils/storage";

export default function StudentMore() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user, logout, refreshUser, deviceId, quickFlags, setQuickFlags } = useAuth();
  const [sharePhone, setSharePhone] = useState(!!user?.share_phone);
  const [wardens, setWardens] = useState<any[]>([]);
  const [callModal, setCallModal] = useState(false);
  const [mpinModal, setMpinModal] = useState(false);
  const [newMpin, setNewMpin] = useState("");

  useFocusEffect(useCallback(() => {
    refreshUser();
    api("/student/warden-contact").then(setWardens).catch(() => {});
  }, []));

  const toggleShare = async (val: boolean) => {
    setSharePhone(val);
    try {
      await api("/student/profile", { method: "PATCH", body: { share_phone: val } });
      toast.show(val ? "Your number is now visible to roommates" : "Your number is now private", "success");
      refreshUser();
    } catch (e: any) {
      setSharePhone(!val);
      toast.show(e.message, "error");
    }
  };

  const saveMpin = async () => {
    if (newMpin.length < 4) return toast.show("MPIN must be 4–6 digits", "error");
    try {
      await api("/auth/quick/setup", { method: "POST", body: { device_id: deviceId, mpin: newMpin } });
      await setQuickFlags({ ...(quickFlags || {}), mpin: true, name: user?.name });
      toast.show("MPIN saved for this device", "success");
      setMpinModal(false);
      setNewMpin("");
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  };

  const enableBiometric = async () => {
    if (Platform.OS === "web") return toast.show("Biometrics are available only on mobile devices", "info");
    const hw = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hw || !enrolled) return toast.show("No biometrics enrolled on this device", "error");
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: "Enable biometric quick login" });
    if (!res.success) return toast.show("Biometric setup cancelled", "info");
    try {
      await api("/auth/quick/setup", { method: "POST", body: { device_id: deviceId, biometric_enrolled: true } });
      const token = await storage.secureGet(TOKEN_KEY, null);
      if (token) await storage.secureSet(BIO_TOKEN_KEY, token as string);
      await setQuickFlags({ ...(quickFlags || {}), biometric: true, name: user?.name });
      toast.show("Biometric quick login enabled", "success");
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  };

  const doLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const links = [
    { label: "Warden Messages", icon: "chatbubbles-outline", route: "/threads", testID: "more-threads-link" },
    { label: "Announcements", icon: "megaphone-outline", route: "/announcements", testID: "more-announcements-link" },
    { label: "Notifications", icon: "notifications-outline", route: "/notifications", testID: "more-notifications-link" },
  ];

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Text style={styles.headerTitle}>More</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.xl, paddingBottom: 40 }}>
        <Card style={{ flexDirection: "row", alignItems: "center", gap: S.md }} testID="profile-card">
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.split(" ").map((w) => w[0]).slice(0, 2).join("")}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.name}</Text>
            <Text style={styles.sub}>{user?.registration_number} · {user?.email}</Text>
          </View>
        </Card>

        {/* Urgent call */}
        <Pressable testID="urgent-call-warden-button" onPress={() => setCallModal(true)} style={styles.urgentBtn}>
          <Ionicons name="call" size={22} color="#FFF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.urgentTitle}>Urgent — Call Warden Now</Text>
            <Text style={styles.urgentSub}>For genuine emergencies only</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#FFF" />
        </Pressable>

        <View>
          <SectionTitle title="Privacy" />
          <Card style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
            <Ionicons name="call-outline" size={20} color={C.brand} />
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>Share my number with roommates</Text>
              <Text style={styles.settingSub}>Roommates only see your phone if this is on</Text>
            </View>
            <Switch testID="share-phone-toggle" value={sharePhone} onValueChange={toggleShare} trackColor={{ true: C.brand }} />
          </Card>
        </View>

        <View>
          <SectionTitle title="Quick Login (this device)" />
          <Card style={{ gap: S.md }}>
            <Pressable testID="setup-mpin-row" onPress={() => setMpinModal(true)} style={styles.settingRow}>
              <Ionicons name="keypad-outline" size={20} color={C.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>{quickFlags?.mpin ? "Change MPIN" : "Set up MPIN"}</Text>
                <Text style={styles.settingSub}>{quickFlags?.mpin ? "MPIN is active on this device" : "4–6 digit PIN for quick unlock"}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.mutedLight} />
            </Pressable>
            <View style={styles.divider} />
            <Pressable testID="enable-biometric-row" onPress={enableBiometric} style={styles.settingRow}>
              <Ionicons name="finger-print-outline" size={20} color={C.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>{quickFlags?.biometric ? "Biometric login enabled" : "Enable biometric login"}</Text>
                <Text style={styles.settingSub}>Fingerprint / Face ID unlock. Password always works as fallback.</Text>
              </View>
              {quickFlags?.biometric ? <Ionicons name="checkmark-circle" size={18} color={C.success} /> : <Ionicons name="chevron-forward" size={16} color={C.mutedLight} />}
            </Pressable>
          </Card>
        </View>

        <View>
          <SectionTitle title="Hostel" />
          <Card style={{ gap: S.md }}>
            {links.map((l, i) => (
              <React.Fragment key={l.label}>
                {i > 0 && <View style={styles.divider} />}
                <Pressable testID={l.testID} onPress={() => router.push(l.route as any)} style={styles.settingRow}>
                  <Ionicons name={l.icon as any} size={20} color={C.brand} />
                  <Text style={[styles.settingTitle, { flex: 1 }]}>{l.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color={C.mutedLight} />
                </Pressable>
              </React.Fragment>
            ))}
          </Card>
        </View>

        <Btn title="Log Out" icon="log-out-outline" variant="danger" onPress={doLogout} testID="logout-button" />
      </ScrollView>

      {/* Urgent call modal */}
      <Modal visible={callModal} transparent animationType="slide" onRequestClose={() => setCallModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + S.xl }]}>
            <Text style={styles.sheetTitle}>Warden Contact</Text>
            {wardens.length === 0 && <Text style={styles.settingSub}>No warden assigned to your block yet.</Text>}
            {wardens.map((w) => (
              <Pressable
                key={w.id}
                testID={`call-warden-${w.id}`}
                onPress={() => Linking.openURL(`tel:${w.phone}`)}
                style={styles.callRow}
              >
                <View style={styles.callIcon}><Ionicons name="call" size={18} color="#FFF" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingTitle}>{w.name}</Text>
                  <Text style={styles.settingSub}>{w.phone}</Text>
                </View>
                <Text style={{ color: C.success, fontWeight: "700", fontSize: 13 }}>Call</Text>
              </Pressable>
            ))}
            <Btn title="Close" variant="ghost" onPress={() => setCallModal(false)} testID="close-call-modal-button" />
          </View>
        </View>
      </Modal>

      {/* MPIN modal */}
      <Modal visible={mpinModal} transparent animationType="slide" onRequestClose={() => setMpinModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + S.xl }]}>
            <Text style={styles.sheetTitle}>Set MPIN</Text>
            <Input testID="more-mpin-input" label="4–6 digit MPIN" placeholder="e.g. 4821" value={newMpin} onChangeText={setNewMpin} keyboardType="number-pad" secureTextEntry maxLength={6} />
            <Btn title="Save MPIN" onPress={saveMpin} testID="more-save-mpin-button" />
            <Btn title="Cancel" variant="ghost" onPress={() => setMpinModal(false)} testID="more-cancel-mpin-button" />
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
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: C.brand, fontSize: 16, fontWeight: "800" },
  name: { fontSize: 16, fontWeight: "800", color: C.onSurface },
  sub: { fontSize: 12, color: C.muted, marginTop: 2 },
  urgentBtn: {
    flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: C.error,
    borderRadius: R.md, padding: S.lg,
  },
  urgentTitle: { color: "#FFF", fontSize: 15, fontWeight: "800" },
  urgentSub: { color: "#FECACA", fontSize: 12 },
  settingRow: { flexDirection: "row", alignItems: "center", gap: S.md, minHeight: 44 },
  settingTitle: { fontSize: 14, fontWeight: "600", color: C.onSurface },
  settingSub: { fontSize: 12, color: C.muted, marginTop: 1 },
  divider: { height: 1, backgroundColor: C.divider },
  modalOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, padding: S.xl, gap: S.lg },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: C.onSurface },
  callRow: { flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: S.sm },
  callIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.success, alignItems: "center", justifyContent: "center" },
});
