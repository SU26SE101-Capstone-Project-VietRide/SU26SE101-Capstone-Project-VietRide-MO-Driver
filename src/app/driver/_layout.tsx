import { Redirect, Stack } from "expo-router";

import {
    getHomeHrefForRole,
    useSession,
} from "@/features/session/session-context";

export default function DriverLayout() {
  const { isAuthenticated, role } = useSession();

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  if (role !== "DRIVER") {
    return <Redirect href={getHomeHrefForRole(role)} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      {/* Cài đặt nằm ngoài tab bar (mở từ nút bánh răng góc phải header) và tự
          dựng nút back trong OperationsScreen → tắt native header. */}
      <Stack.Screen name="settings" />
      {/* Manifest chuyến trung chuyển — mở từ section Xe trung chuyển hoặc
          push notification SHUTTLE_ASSIGNED. */}
      <Stack.Screen name="shuttle/[shuttleTripId]" />
      {/* Duyệt phiếu sự cố kiện / xin rời điểm — mở kèm parcelId hoặc
          requestId (backend chưa có endpoint danh sách phiếu chờ). */}
      <Stack.Screen name="parcel-approval" />
    </Stack>
  );
}
