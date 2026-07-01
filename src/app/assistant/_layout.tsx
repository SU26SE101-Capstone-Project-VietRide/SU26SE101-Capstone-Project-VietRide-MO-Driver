import { Redirect, Stack } from "expo-router";

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
      {/* Màn Báo sự cố tự dựng nút back trong OperationsScreen (giống notifications),
          nên tắt native header để tránh chồng khoảng đệm safe-area gây dải trống. */}
      <Stack.Screen name="incident" />
    </Stack>
  );
}
