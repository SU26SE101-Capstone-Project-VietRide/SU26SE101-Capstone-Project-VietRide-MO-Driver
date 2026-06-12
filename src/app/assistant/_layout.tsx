import { Redirect, Stack } from "expo-router";

import { Colors } from "@/constants/theme";
import {
    getHomeHrefForRole,
    useSession,
} from "@/features/session/session-context";

export default function AssistantLayout() {
  const { isAuthenticated, role } = useSession();

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  if (role !== "ASSISTANT") {
    return <Redirect href={getHomeHrefForRole(role)} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="incident"
        options={{
          headerShown: true,
          headerTitle: "",
          headerBackTitle: "Quay lại",
          headerTintColor: Colors.dark.text,
          headerStyle: { backgroundColor: Colors.dark.background },
          headerShadowVisible: false,
        }}
      />
    </Stack>
  );
}
