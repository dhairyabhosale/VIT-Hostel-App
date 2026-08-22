import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Switch } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { Btn, Card, Input, SectionTitle } from "@/src/components/UI";
import { useAuth } from "@/src/context/AuthContext";
import { C, S } from "@/src/theme";

export default function AdminMore() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user, logout } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);

  const post = async () => {
    if (!title.trim() || !body.trim()) return toast.show("Title and body are required", "error");
    setBusy(true);
    try {
      await api("/announcements", { method: "POST", body: { scope: "all", title: title.trim(), body: body.trim(), pinned } });
      toast.show("Global announcement posted to all blocks", "success");
      setTitle(""); setBody(""); setPinned(false);
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally { setBusy(false); }
  };

  const doLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Text style={styles.headerTitle}>More</Text>
        <Text style={styles.headerSub}>{user?.name} · {user?.email}</Text>
      </View>
      <KeyboardAwareScrollView contentContainerStyle={{ padding: S.lg, gap: S.xl, paddingBottom: 60 }} bottomOffset={24}>
        <View>
          <SectionTitle title="Shortcuts" />
          <Card style={{ gap: S.md }}>
            <Pressable testID="admin-announcements-link" onPress={() => router.push("/announcements")} style={styles.row}>
              <Ionicons name="megaphone-outline" size={20} color={C.brand} />
              <Text style={[styles.rowText, { flex: 1 }]}>View Announcements</Text>
              <Ionicons name="chevron-forward" size={16} color={C.mutedLight} />
            </Pressable>
            <View style={styles.divider} />
            <Pressable testID="admin-threads-link" onPress={() => router.push("/threads")} style={styles.row}>
              <Ionicons name="chatbubbles-outline" size={20} color={C.brand} />
              <Text style={[styles.rowText, { flex: 1 }]}>All Message Threads</Text>
              <Ionicons name="chevron-forward" size={16} color={C.mutedLight} />
            </Pressable>
          </Card>
        </View>

        <View>
          <SectionTitle title="Global Announcement (all blocks)" />
          <Card style={{ gap: S.lg }}>
            <Input testID="global-announcement-title-input" label="Title" placeholder="e.g. Semester-end hostel checkout" value={title} onChangeText={setTitle} />
            <Input testID="global-announcement-body-input" label="Details" placeholder="Announcement details…" value={body} onChangeText={setBody} multiline />
            <View style={styles.row}>
              <Text style={[styles.rowText, { flex: 1 }]}>Pin to top</Text>
              <Switch testID="global-announcement-pinned-toggle" value={pinned} onValueChange={setPinned} trackColor={{ true: C.brand }} />
            </View>
            <Btn title="Post to All Blocks" icon="send-outline" onPress={post} loading={busy} testID="post-global-announcement-button" />
          </Card>
        </View>

        <Btn title="Log Out" icon="log-out-outline" variant="danger" onPress={doLogout} testID="admin-logout-button" />
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  header: { backgroundColor: C.brand, paddingHorizontal: S.lg, paddingBottom: S.lg },
  headerTitle: { color: "#FFF", fontSize: 20, fontWeight: "800" },
  headerSub: { color: "#B6C4DE", fontSize: 12, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, minHeight: 44 },
  rowText: { fontSize: 14, fontWeight: "600", color: C.onSurface },
  divider: { height: 1, backgroundColor: C.divider },
});
