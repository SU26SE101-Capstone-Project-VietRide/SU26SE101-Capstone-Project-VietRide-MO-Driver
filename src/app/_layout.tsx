import { DarkTheme, DefaultTheme, Slot, ThemeProvider } from "expo-router";
import { useColorScheme } from "react-native";
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

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? DarkTheme : DefaultTheme;
  const palette = Colors[colorScheme === "unspecified" ? "dark" : colorScheme];

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
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
        <SessionProvider>
          <AppSessionGate />
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function AppSessionGate() {
  const { session } = useSession();

  if (!session) {
    return <Slot />;
  }

  return (
    <OperationsProvider key={session.crewId}>
      <Slot />
    </OperationsProvider>
  );
}
