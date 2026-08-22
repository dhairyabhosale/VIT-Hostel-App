import { Redirect } from "expo-router";
import { View, ActivityIndicator, StyleSheet } from "react-native";

import { useAuth } from "@/src/context/AuthContext";
import { C } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.container} testID="app-loading">
        <ActivityIndicator size="large" color={C.brand} />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;
  if (user.role === "student") return <Redirect href="/student" />;
  if (user.role === "warden") return <Redirect href="/warden" />;
  return <Redirect href="/admin" />;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
});
