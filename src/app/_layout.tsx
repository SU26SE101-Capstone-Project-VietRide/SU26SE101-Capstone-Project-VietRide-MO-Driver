import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Slot, Stack, ThemeProvider } from "expo-router";
import { type PropsWithChildren } from "react";
import { ActivityIndicator, View } from "react-native";
import {
    SafeAreaProvider,
    initialWindowMetrics,
} from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";
import { useApprovalDeepLink } from "@/features/notifications/use-approval-deep-link";
import { usePushNavigation } from "@/features/notifications/use-push-navigation";
import {
    SessionProvider,
    useSession,
} from "@/features/session/session-context";
import { ThemeModeProvider, useThemeMode } from "@/features/theme/theme-mode";
import { SelectedTripProvider } from "@/features/trips/selected-trip-context";
import { useTheme } from "@/hooks/use-theme";

// Cache mặc định: dữ liệu vận hành đổi thường xuyên nên staleTime ngắn;
// retry 1 lần là đủ vì client đã tự refresh token khi 401.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export default function TabLayout() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ThemeModeProvider>
        <ThemedNavigation>
          <QueryClientProvider client={queryClient}>
            <SessionProvider>
              <AppSessionGate />
            </SessionProvider>
          </QueryClientProvider>
        </ThemedNavigation>
      </ThemeModeProvider>
    </SafeAreaProvider>
  );
}

function ThemedNavigation({ children }: PropsWithChildren) {
  const { mode } = useThemeMode();
  const theme = mode === "dark" ? DarkTheme : DefaultTheme;
  const palette = Colors[mode];

  return (
    <ThemeProvider
      value={{
        ...theme,
        colors: {
          ...theme.colors,
          background: palette.background,
          border: palette.border,
          card: palette.backgroundElement,
          notification: palette.danger,
          primary: palette.primary,
          text: palette.text,
        },
      }}
    >
      {children}
    </ThemeProvider>
  );
}

function AppSessionGate() {
  const { session, status } = useSession();
  const theme = useTheme();

  // Bấm push → điều hướng theo data.type (chỉ chạy khi đã đăng nhập).
  usePushNavigation();

  // Mở link phiếu duyệt (App Link https hoặc vietride://) thẳng trong app
  // thay vì rơi ra trình duyệt (FE-PCL-003).
  useApprovalDeepLink();

  // Đang khôi phục phiên từ secure store — chưa biết vào đâu.
  if (status === "loading") {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.background,
        }}
      >
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!session) {
    return <Slot />;
  }

  return (
    // key theo crewId: đổi tài khoản là remount cả cây điều hướng, không sót
    // state màn hình của phiên trước (trước đây key nằm ở OperationsProvider
    // mock — provider đã xoá nhưng hành vi reset này phải giữ). Provider nằm
    // TRONG key này để chuyến đang chọn cũng reset theo phiên.
    <SelectedTripProvider key={session.crewId}>
      <Stack screenOptions={{ headerShown: false }}>
        {/* Màn Thông báo dùng chung cho cả Driver và Assistant, dựng header riêng. */}
        <Stack.Screen name="notifications" />
      </Stack>
    </SelectedTripProvider>
  );
}
