import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, FlatList, ActivityIndicator, Platform } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { StatusBadge } from "@/src/components/UI";
import { useAuth } from "@/src/context/AuthContext";
import { C, R, S, fmtDate } from "@/src/theme";

export default function ThreadDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const [thread, setThread] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    try {
      setThread(await api(`/threads/${id}`));
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await api(`/threads/${id}/messages`, { method: "POST", body: { text: text.trim() } });
      setText("");
      await load();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 200);
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setSending(false);
    }
  };

  const closeThread = async () => {
    try {
      await api(`/threads/${id}/close`, { method: "POST" });
      toast.show("Thread closed", "success");
      load();
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={C.brand} /></View>;
  if (!thread) return <View style={styles.center}><Text style={{ color: C.muted }}>Thread not found</Text></View>;

  const canClose = (user?.role === "warden" || user?.role === "admin") && thread.status === "open";

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="thread-back-button" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{thread.subject}</Text>
          <Text style={styles.headerSub}>{user?.role === "student" ? "Warden thread" : thread.student_name}</Text>
        </View>
        {canClose ? (
          <Pressable testID="close-thread-button" onPress={closeThread} style={styles.closeBtn}>
            <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "700" }}>Close</Text>
          </Pressable>
        ) : (
          <StatusBadge status={thread.status} />
        )}
      </View>

      <FlatList
        ref={listRef}
        data={thread.messages}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: S.lg, gap: S.md }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          const mine = item.sender_id === user?.id;
          return (
            <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
              <Text style={[styles.bubbleSender, { color: mine ? "#B6C4DE" : C.muted }]}>
                {item.sender_name} · {item.sender_role}
              </Text>
              <Text style={{ color: mine ? "#FFF" : C.onSurface, fontSize: 14, lineHeight: 20 }}>{item.text}</Text>
              <Text style={[styles.bubbleTime, { color: mine ? "#8AA0C6" : C.mutedLight }]}>{fmtDate(item.timestamp)}</Text>
            </View>
          );
        }}
      />

      {thread.status === "open" ? (
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, S.md) }]}>
          <TextInput
            testID="thread-message-input"
            style={styles.input}
            placeholder="Type a message…"
            placeholderTextColor={C.mutedLight}
            value={text}
            onChangeText={setText}
            multiline
          />
          <Pressable testID="thread-send-button" onPress={send} disabled={sending} style={styles.sendBtn}>
            <Ionicons name="send" size={18} color="#FFF" />
          </Pressable>
        </View>
      ) : (
        <View style={[styles.closedBar, { paddingBottom: Math.max(insets.bottom, S.md) }]}>
          <Text style={{ color: C.muted, fontSize: 13 }}>This thread has been closed.</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  header: {
    backgroundColor: C.brand, flexDirection: "row", alignItems: "center", gap: S.sm,
    paddingHorizontal: S.md, paddingBottom: S.md,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  headerSub: { color: "#B6C4DE", fontSize: 12 },
  closeBtn: { backgroundColor: C.error, paddingHorizontal: 12, height: 32, borderRadius: R.pill, alignItems: "center", justifyContent: "center" },
  bubble: { maxWidth: "82%", borderRadius: R.md, padding: S.md, gap: 3 },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: C.brandSecondary, borderBottomRightRadius: 4 },
  bubbleOther: { alignSelf: "flex-start", backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderBottomLeftRadius: 4 },
  bubbleSender: { fontSize: 11, fontWeight: "700" },
  bubbleTime: { fontSize: 10, marginTop: 2 },
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: S.sm, padding: S.md,
    backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border,
  },
  input: {
    flex: 1, minHeight: 44, maxHeight: 110, backgroundColor: C.surfaceTertiary,
    borderRadius: R.lg, paddingHorizontal: S.lg, paddingVertical: 11, fontSize: 14, color: C.onSurface,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.brand, alignItems: "center", justifyContent: "center" },
  closedBar: { alignItems: "center", padding: S.md, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border },
});
