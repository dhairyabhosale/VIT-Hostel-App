import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, Platform } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, TOKEN_KEY, BIO_TOKEN_KEY } from "@/src/api/client";
import { useToast } from "@/src/components/Toast";
import { Btn, Card, Input } from "@/src/components/UI";
import { useAuth, User } from "@/src/context/AuthContext";
import { C, R, S } from "@/src/theme";
import { storage } from "@/src/utils/storage";

type Role = "student" | "warden" | "admin";
type Mode = "login" | "activate1" | "activate2";

export default function Login() {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { login, setSession, deviceId, quickFlags, setQuickFlags } = useAuth();

  const [role, setRole] = useState<Role>("student");
  const [mode, setMode] = useState<Mode>("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [mockOtp, setMockOtp] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [mpin, setMpin] = useState("");
  const [showQuickSetup, setShowQuickSetup] = useState(false);
  const [setupMpin, setSetupMpin] = useState("");
  const [pendingUser, setPendingUser] = useState<User | null>(null);

  const goHome = (u: User) => {
    if (u.role === "student") router.replace("/student");
    else if (u.role === "warden") router.replace("/warden");
    else router.replace("/admin");
  };

  const doLogin = async () => {
    if (!identifier.trim() || !password) return toast.show("Enter your credentials", "error");
    setBusy(true);
    try {
      const u = await login(identifier.trim(), password);
      if (u.role === "student" && Platform.OS !== "web") {
        const prompted = await storage.getItem("vhc_quick_prompted", false);
        if (!prompted && !quickFlags) {
          setPendingUser(u);
          setShowQuickSetup(true);
          setBusy(false);
          return;
        }
      }
      goHome(u);
    } catch (e: any) {
      if (e.message?.includes("First-time")) {
        toast.show("First-time setup required. Activate your account below.", "info");
        setMode("activate1");
      } else {
        toast.show(e.message, "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const doInitiate = async () => {
    if (!identifier.trim()) return toast.show("Enter your registration number", "error");
    setBusy(true);
    try {
      const res = await api("/auth/student/initiate", { method: "POST", body: { registration_number: identifier.trim() } });
      setMockOtp(res.mock_otp);
      setOtpEmail(res.email);
      setMode("activate2");
      toast.show(`OTP sent to ${res.email}`, "success");
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const doActivate = async () => {
    if (otp.length < 6) return toast.show("Enter the 6-digit OTP", "error");
    if (newPassword.length < 6) return toast.show("Password must be at least 6 characters", "error");
    setBusy(true);
    try {
      const res = await api("/auth/student/activate", { method: "POST", body: { registration_number: identifier.trim(), otp, password: newPassword } });
      await setSession(res.access_token, res.user);
      if (Platform.OS !== "web") {
        setPendingUser(res.user);
        setShowQuickSetup(true);
      } else {
        goHome(res.user);
      }
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const doMpinUnlock = async () => {
    if (mpin.length < 4) return toast.show("Enter your MPIN", "error");
    setBusy(true);
    try {
      const res = await api("/auth/quick/mpin-unlock", { method: "POST", body: { device_id: deviceId, mpin } });
      await setSession(res.access_token, res.user);
      goHome(res.user);
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const doBiometricUnlock = async () => {
    try {
      const ok = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock VIT Hostel Connect" });
      if (!ok.success) return toast.show("Biometric authentication failed. Use your password.", "error");
      const bioToken = await storage.secureGet(BIO_TOKEN_KEY, null);
      if (!bioToken) return toast.show("Session expired. Please log in with your password.", "error");
      await storage.secureSet(TOKEN_KEY, bioToken as string);
      const me = await api("/auth/me");
      await setSession(bioToken as string, me);
      goHome(me);
    } catch (e: any) {
      toast.show(e.message || "Biometric unlock failed", "error");
    }
  };

  const finishQuickSetup = async (skip: boolean, useBiometric: boolean) => {
    await storage.setItem("vhc_quick_prompted", true);
    if (!skip && pendingUser) {
      try {
        if (useBiometric) {
          const hw = await LocalAuthentication.hasHardwareAsync();
          const enrolled = await LocalAuthentication.isEnrolledAsync();
          if (!hw || !enrolled) {
            toast.show("Biometrics not available on this device", "error");
          } else {
            const res = await LocalAuthentication.authenticateAsync({ promptMessage: "Enable biometric quick login" });
            if (res.success) {
              await api("/auth/quick/setup", { method: "POST", body: { device_id: deviceId, biometric_enrolled: true } });
              const token = await storage.secureGet(TOKEN_KEY, null);
              if (token) await storage.secureSet(BIO_TOKEN_KEY, token as string);
              await setQuickFlags({ ...(quickFlags || {}), biometric: true, name: pendingUser.name });
              toast.show("Biometric quick login enabled", "success");
            }
          }
        } else if (setupMpin.length >= 4) {
          await api("/auth/quick/setup", { method: "POST", body: { device_id: deviceId, mpin: setupMpin } });
          await setQuickFlags({ ...(quickFlags || {}), mpin: true, name: pendingUser.name });
          toast.show("MPIN quick login enabled", "success");
        }
      } catch (e: any) {
        toast.show(e.message, "error");
      }
    }
    setShowQuickSetup(false);
    if (pendingUser) goHome(pendingUser);
  };

  return (
    <View style={styles.root}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { paddingTop: insets.top + S.xxl }]}>
          <View style={styles.logoCircle}>
            <Ionicons name="business" size={30} color="#FFF" />
          </View>
          <Text style={styles.heroTitle}>VIT Hostel Connect</Text>
          <Text style={styles.heroSub}>Hostel services, requests & attendance — all in one place</Text>
        </View>

        <View style={styles.body}>
          {quickFlags && mode === "login" && (
            <Card style={{ marginBottom: S.lg, gap: S.md }} testID="quick-unlock-card">
              <Text style={styles.quickTitle}>Quick login{quickFlags.name ? ` — ${quickFlags.name}` : ""}</Text>
              {quickFlags.mpin && (
                <View style={{ flexDirection: "row", gap: S.sm }}>
                  <View style={{ flex: 1 }}>
                    <Input
                      testID="mpin-unlock-input"
                      placeholder="Enter MPIN"
                      value={mpin}
                      onChangeText={setMpin}
                      keyboardType="number-pad"
                      secureTextEntry
                      maxLength={6}
                    />
                  </View>
                  <Btn title="Unlock" onPress={doMpinUnlock} loading={busy} testID="mpin-unlock-button" />
                </View>
              )}
              {quickFlags.biometric && (
                <Btn title="Unlock with Biometrics" icon="finger-print" variant="secondary" onPress={doBiometricUnlock} testID="biometric-unlock-button" />
              )}
              <Text style={styles.quickHint}>Or use registration number + password below</Text>
            </Card>
          )}

          <View style={styles.segment}>
            {(["student", "warden", "admin"] as Role[]).map((r) => (
              <Pressable
                key={r}
                testID={`role-tab-${r}`}
                onPress={() => { setRole(r); setMode("login"); setIdentifier(""); setPassword(""); }}
                style={[styles.segmentItem, role === r && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, role === r && styles.segmentTextActive]}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          {mode === "login" && (
            <View style={{ gap: S.lg }}>
              <Input
                testID="login-identifier-input"
                label={role === "student" ? "Registration Number" : "Official Email"}
                placeholder={role === "student" ? "e.g. 23BCE1001" : "name@vit.ac.in"}
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize={role === "student" ? "characters" : "none"}
                keyboardType={role === "student" ? "default" : "email-address"}
              />
              <Input
                testID="login-password-input"
                label="Password"
                placeholder="Your password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
              <Btn title="Log In" onPress={doLogin} loading={busy} testID="login-submit-button" />
              {role === "student" && (
                <Pressable testID="activate-account-link" onPress={() => setMode("activate1")}>
                  <Text style={styles.link}>First time here? Activate your account →</Text>
                </Pressable>
              )}
            </View>
          )}

          {mode === "activate1" && (
            <View style={{ gap: S.lg }}>
              <Text style={styles.stepTitle}>Account Activation</Text>
              <Text style={styles.stepSub}>Enter your registration number. We&apos;ll send a one-time OTP to your registered VIT email.</Text>
              <Input
                testID="activate-regno-input"
                label="Registration Number"
                placeholder="e.g. 23BCE1003"
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize="characters"
              />
              <Btn title="Send OTP" onPress={doInitiate} loading={busy} testID="send-otp-button" />
              <Pressable testID="back-to-login-link" onPress={() => setMode("login")}>
                <Text style={styles.link}>← Back to login</Text>
              </Pressable>
            </View>
          )}

          {mode === "activate2" && (
            <View style={{ gap: S.lg }}>
              <Text style={styles.stepTitle}>Verify & Set Password</Text>
              <Text style={styles.stepSub}>OTP sent to {otpEmail}</Text>
              {mockOtp ? (
                <View style={styles.mockOtpBox} testID="mock-otp-box">
                  <Ionicons name="mail-outline" size={16} color={C.info} />
                  <Text style={styles.mockOtpText}>Demo mode — your OTP is: <Text style={{ fontWeight: "800" }}>{mockOtp}</Text></Text>
                </View>
              ) : null}
              <Input
                testID="otp-input"
                label="OTP"
                placeholder="6-digit OTP"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
              />
              <Input
                testID="new-password-input"
                label="Set Your Password"
                placeholder="Minimum 6 characters"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />
              <Btn title="Activate Account" onPress={doActivate} loading={busy} testID="activate-submit-button" />
              <Pressable onPress={() => setMode("activate1")}>
                <Text style={styles.link}>← Resend OTP</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.demoBox}>
            <Text style={styles.demoTitle}>Demo accounts</Text>
            <Text style={styles.demoText}>Student: 23BCE1001 / Student@123</Text>
            <Text style={styles.demoText}>Warden: warden.h@vit.ac.in / Warden@123</Text>
            <Text style={styles.demoText}>Admin: admin@vit.ac.in / Admin@123</Text>
            <Text style={styles.demoText}>New student (activation): 23BCE1003</Text>
          </View>
        </View>
      </KeyboardAwareScrollView>

      <Modal visible={showQuickSetup} transparent animationType="slide" onRequestClose={() => finishQuickSetup(true, false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + S.xl }]}>
            <Text style={styles.stepTitle}>Set up quick login?</Text>
            <Text style={styles.stepSub}>Unlock faster on this device with an MPIN or biometrics. Your password always works as a fallback.</Text>
            <Input
              testID="setup-mpin-input"
              label="Choose a 4–6 digit MPIN"
              placeholder="e.g. 4821"
              value={setupMpin}
              onChangeText={setSetupMpin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
            />
            <Btn title="Save MPIN" onPress={() => finishQuickSetup(false, false)} disabled={setupMpin.length < 4} testID="save-mpin-button" />
            <Btn title="Use Biometrics Instead" icon="finger-print" variant="secondary" onPress={() => finishQuickSetup(false, true)} testID="enable-biometric-button" />
            <Btn title="Skip for now" variant="ghost" onPress={() => finishQuickSetup(true, false)} testID="skip-quick-setup-button" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  hero: {
    backgroundColor: C.brand,
    paddingBottom: S.xxl,
    paddingHorizontal: S.xl,
    borderBottomLeftRadius: R.lg + 8,
    borderBottomRightRadius: R.lg + 8,
    gap: S.md,
  },
  logoCircle: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: C.brandSecondary,
    alignItems: "center", justifyContent: "center",
  },
  heroTitle: { color: "#FFF", fontSize: 26, fontWeight: "800" },
  heroSub: { color: "#B6C4DE", fontSize: 14, lineHeight: 20 },
  body: { padding: S.xl, gap: S.xl },
  segment: {
    flexDirection: "row", backgroundColor: C.surfaceTertiary, borderRadius: R.md,
    padding: 4, marginBottom: S.sm,
  },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: R.sm + 2, alignItems: "center" },
  segmentActive: { backgroundColor: C.brand },
  segmentText: { fontSize: 14, fontWeight: "600", color: C.muted },
  segmentTextActive: { color: "#FFF" },
  link: { color: C.info, fontSize: 14, fontWeight: "600", textAlign: "center", paddingVertical: 4 },
  stepTitle: { fontSize: 18, fontWeight: "800", color: C.onSurface },
  stepSub: { fontSize: 13, color: C.muted, lineHeight: 19 },
  mockOtpBox: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.infoBg,
    borderRadius: R.md, padding: S.md,
  },
  mockOtpText: { color: C.info, fontSize: 13, flex: 1 },
  demoBox: { backgroundColor: C.surfaceTertiary, borderRadius: R.md, padding: S.lg, gap: 4, marginTop: S.sm },
  demoTitle: { fontSize: 12, fontWeight: "800", color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  demoText: { fontSize: 12, color: C.onSurfaceSecondary },
  modalOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: C.card, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg,
    padding: S.xl, gap: S.lg,
  },
  quickTitle: { fontSize: 15, fontWeight: "700", color: C.onSurface },
  quickHint: { fontSize: 12, color: C.muted, textAlign: "center" },
});
