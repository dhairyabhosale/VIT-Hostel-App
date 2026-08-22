import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { Btn, Chip, Input } from "@/src/components/UI";
import { C, R, S, CATEGORY_ICONS } from "@/src/theme";

const TIME_SLOTS = ["8:00 AM – 10:00 AM", "10:00 AM – 12:00 PM", "12:00 PM – 2:00 PM", "2:00 PM – 4:00 PM", "4:00 PM – 6:00 PM", "6:00 PM – 8:00 PM", "8:00 PM – 10:00 PM"];
const CATEGORIES = Object.keys(CATEGORY_ICONS);
const URGENCIES = ["low", "medium", "high"];
const CHANGE_TYPES = [
  { key: "room_change", label: "Room Change" },
  { key: "block_change", label: "Block Change" },
  { key: "mess_change", label: "Mess Change" },
];

export default function NewRequest() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // cleaning
  const [slot, setSlot] = useState(TIME_SLOTS[0]);
  const [notes, setNotes] = useState("");
  const [availability, setAvailability] = useState<any>(null);

  // complaint
  const [category, setCategory] = useState("electrical");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState("medium");

  // change
  const [changeType, setChangeType] = useState("room_change");
  const [requestedValue, setRequestedValue] = useState("");
  const [reason, setReason] = useState("");
  const [messPlans, setMessPlans] = useState<any[]>([]);

  useEffect(() => {
    if (type === "cleaning") {
      api("/student/cleaning/availability").then(setAvailability).catch(() => {});
    }
    if (type === "change") {
      api("/admin/mess-plans").then(setMessPlans).catch(() => {});
    }
  }, [type]);

  const submit = async () => {
    setBusy(true);
    try {
      if (type === "cleaning") {
        await api("/student/cleaning", { method: "POST", body: { preferred_time_slot: slot, notes } });
        toast.show("Cleaning request submitted", "success");
      } else if (type === "complaint") {
        if (!description.trim()) { toast.show("Describe the issue", "error"); setBusy(false); return; }
        await api("/student/complaints", { method: "POST", body: { category, description: description.trim(), urgency } });
        toast.show("Complaint submitted", "success");
      } else {
        if (!requestedValue.trim() || !reason.trim()) { toast.show("Fill in the requested value and reason", "error"); setBusy(false); return; }
        await api("/student/change-requests", { method: "POST", body: { request_type: changeType, requested_value: requestedValue.trim(), reason: reason.trim() } });
        toast.show("Change request submitted for review", "success");
      }
      router.back();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const title = type === "cleaning" ? "Request Room Cleaning" : type === "complaint" ? "Report Maintenance Issue" : "Request a Change";
  const cleaningBlocked = type === "cleaning" && availability && !availability.can_request;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
        <Pressable testID="new-request-back-button" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 140, gap: S.xl }} bottomOffset={90}>
        {type === "cleaning" && (
          <>
            {availability && (
              <View style={[styles.infoBox, { backgroundColor: cleaningBlocked ? C.errorBg : C.infoBg }]} testID="cleaning-availability-banner">
                <Ionicons name={cleaningBlocked ? "alert-circle-outline" : "information-circle-outline"} size={18} color={cleaningBlocked ? C.error : C.info} />
                <Text style={{ flex: 1, fontSize: 13, color: cleaningBlocked ? C.error : C.info, lineHeight: 18 }}>
                  {cleaningBlocked
                    ? availability.reason
                    : `Allowed hours: ${availability.allowed_hours} · ${2 - (availability.rate?.used || 0)} of 2 requests remaining in this 12-hour window`}
                </Text>
              </View>
            )}
            <View style={{ gap: S.sm }}>
              <Text style={styles.label}>Preferred Time Slot</Text>
              <View style={{ gap: S.sm }}>
                {TIME_SLOTS.map((s) => (
                  <Pressable
                    key={s}
                    testID={`slot-option-${s.replace(/[^a-zA-Z0-9]/g, "")}`}
                    onPress={() => setSlot(s)}
                    style={[styles.slotRow, slot === s && { borderColor: C.brand, backgroundColor: C.brandTertiary }]}
                  >
                    <Ionicons name={slot === s ? "radio-button-on" : "radio-button-off"} size={18} color={slot === s ? C.brand : C.mutedLight} />
                    <Text style={{ fontSize: 14, color: C.onSurface, fontWeight: slot === s ? "700" : "400" }}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Input testID="cleaning-notes-input" label="Notes (optional)" placeholder="e.g. Please clean the balcony too" value={notes} onChangeText={setNotes} multiline />
          </>
        )}

        {type === "complaint" && (
          <>
            <View style={{ gap: S.sm }}>
              <Text style={styles.label}>Category</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
                {CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat}
                    testID={`category-option-${cat}`}
                    onPress={() => setCategory(cat)}
                    style={[styles.catOpt, category === cat && { borderColor: C.brand, backgroundColor: C.brandTertiary }]}
                  >
                    <Ionicons name={CATEGORY_ICONS[cat] as any} size={16} color={category === cat ? C.brand : C.muted} />
                    <Text style={{ fontSize: 12, fontWeight: "600", color: category === cat ? C.brand : C.onSurfaceSecondary, textTransform: "capitalize" }}>
                      {cat.replace("-", "/")}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Input testID="complaint-description-input" label="Description" placeholder="Describe the issue briefly…" value={description} onChangeText={setDescription} multiline />
            <View style={{ gap: S.sm }}>
              <Text style={styles.label}>Urgency</Text>
              <View style={{ flexDirection: "row", gap: S.sm }}>
                {URGENCIES.map((u) => (
                  <Chip key={u} label={u.charAt(0).toUpperCase() + u.slice(1)} selected={urgency === u} onPress={() => setUrgency(u)} testID={`urgency-option-${u}`} />
                ))}
              </View>
            </View>
          </>
        )}

        {type === "change" && (
          <>
            <View style={{ gap: S.sm }}>
              <Text style={styles.label}>What do you want to change?</Text>
              <View style={{ flexDirection: "row", gap: S.sm }}>
                {CHANGE_TYPES.map((ct) => (
                  <Chip key={ct.key} label={ct.label} selected={changeType === ct.key} onPress={() => { setChangeType(ct.key); setRequestedValue(""); }} testID={`change-type-${ct.key}`} />
                ))}
              </View>
            </View>
            {changeType === "mess_change" && messPlans.length > 0 ? (
              <View style={{ gap: S.sm }}>
                <Text style={styles.label}>Requested Mess Plan</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
                  {messPlans.map((m) => (
                    <Chip key={m.id} label={m.name} selected={requestedValue === m.name} onPress={() => setRequestedValue(m.name)} testID={`mess-option-${m.name}`} />
                  ))}
                </View>
              </View>
            ) : (
              <Input
                testID="requested-value-input"
                label={changeType === "room_change" ? "Requested Room Number" : changeType === "block_change" ? "Requested Block" : "Requested Value"}
                placeholder={changeType === "room_change" ? "e.g. H-105" : "e.g. K Block"}
                value={requestedValue}
                onChangeText={setRequestedValue}
              />
            )}
            <Input testID="change-reason-input" label="Reason" placeholder="Why do you need this change?" value={reason} onChangeText={setReason} multiline />
          </>
        )}
      </KeyboardAwareScrollView>

      <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, S.md) }]}>
        <Btn
          title={cleaningBlocked ? "Requests Unavailable Right Now" : "Submit Request"}
          onPress={submit}
          loading={busy}
          disabled={!!cleaningBlocked}
          testID="submit-request-button"
        />
      </View>
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
  label: { fontSize: 13, fontWeight: "600", color: C.onSurfaceSecondary },
  infoBox: { flexDirection: "row", gap: S.sm, alignItems: "flex-start", padding: S.md, borderRadius: R.md },
  slotRow: {
    flexDirection: "row", alignItems: "center", gap: S.md, padding: S.md,
    borderRadius: R.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, minHeight: 48,
  },
  catOpt: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 40,
    borderRadius: R.pill, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, flexShrink: 0,
  },
  stickyBar: {
    position: "absolute", left: 0, right: 0, bottom: 0, padding: S.lg,
    backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border,
  },
});
