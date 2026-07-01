import { DarkTheme, DefaultTheme, Slot, Stack, ThemeProvider } from "expo-router";
import { type PropsWithChildren } from "react";
import {
    SafeAreaProvider,
    initialWindowMetrics,
} from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";
import { OperationsProvider } from "@/features/operations/operations-context";
import {
    SessionProvider,
    useSession,
} from "@/features/session/session-context";
import { ThemeModeProvider, useThemeMode } from "@/features/theme/theme-mode";

export default function TabLayout() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ThemeModeProvider>
        <ThemedNavigation>
          <SessionProvider>
            <AppSessionGate />
          </SessionProvider>
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
  const { session } = useSession();

  if (!session) {
    return <Slot />;
  }

  return (
    <OperationsProvider key={session.crewId}>
      <Stack screenOptions={{ headerShown: false }}>
        {/* Màn Thông báo dùng chung cho cả Driver và Assistant, dựng header riêng. */}
        <Stack.Screen name="notifications" />
      </Stack>
    </OperationsProvider>
  );
}
