import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { C } from "@/src/theme";

export default function WardenLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.brand,
        tabBarInactiveTintColor: C.mutedLight,
        tabBarStyle: { backgroundColor: C.card, borderTopColor: C.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "grid" : "grid-outline"} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="rollcall"
        options={{
          title: "Roll Call",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "checkbox" : "checkbox-outline"} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="queues"
        options={{
          title: "Queues",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "layers" : "layers-outline"} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "menu" : "menu-outline"} size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
