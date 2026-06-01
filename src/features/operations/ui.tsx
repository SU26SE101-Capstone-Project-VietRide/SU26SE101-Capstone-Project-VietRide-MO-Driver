import { type PropsWithChildren } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
    type ViewStyle,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomTabInset, Fonts, Spacing } from "@/constants/theme";
import { type Tone } from "@/features/operations/mock-data";
import { useTheme } from "@/hooks/use-theme";

const TONE_STYLES = {
  primary: {
    background: "rgba(2, 195, 154, 0.14)",
    border: "rgba(2, 195, 154, 0.24)",
    text: "#02C39A",
  },
  neutral: {
    background: "rgba(148, 163, 174, 0.12)",
    border: "rgba(148, 163, 174, 0.18)",
    text: "#D3DBDF",
  },
  success: {
    background: "rgba(0, 230, 118, 0.14)",
    border: "rgba(0, 230, 118, 0.24)",
    text: "#00E676",
  },
  warning: {
    background: "rgba(255, 214, 0, 0.14)",
    border: "rgba(255, 214, 0, 0.24)",
    text: "#FFD600",
  },
  danger: {
    background: "rgba(255, 82, 82, 0.14)",
    border: "rgba(255, 82, 82, 0.24)",
    text: "#FF7C7C",
  },
  info: {
    background: "rgba(53, 194, 255, 0.14)",
    border: "rgba(53, 194, 255, 0.24)",
    text: "#35C2FF",
  },
} as const;

export function OperationsScreen({
  children,
  subtitle,
  title,
}: PropsWithChildren<{ subtitle: string; title: string }>) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View pointerEvents="none" style={styles.orbPrimary} />
      <View pointerEvents="none" style={styles.orbSecondary} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, Spacing.four),
            paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
          },
        ]}
      >
        <View style={styles.pageHeader}>
          <Text style={styles.pageEyebrow}>VietRide Operations</Text>
          <Text style={styles.pageTitle}>{title}</Text>
          <Text style={styles.pageSubtitle}>{subtitle}</Text>
        </View>
        {children}
      </ScrollView>
    </View>
  );
}

export function SurfaceCard({
  accent = false,
  children,
  delay = 0,
  style,
}: PropsWithChildren<{ accent?: boolean; delay?: number; style?: ViewStyle }>) {
  const theme = useTheme();

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).springify().damping(18)}
      style={[
        styles.card,
        {
          backgroundColor: accent
            ? theme.backgroundSelected
            : theme.backgroundElement,
          borderColor: theme.border,
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function SectionTitle({
  subtitle,
  title,
}: {
  subtitle?: string;
  title: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function MetricTile({
  compact = false,
  hint,
  label,
  tone,
  value,
}: {
  compact?: boolean;
  hint: string;
  label: string;
  tone: Tone;
  value: string;
}) {
  const toneStyle = TONE_STYLES[tone];

  return (
    <View
      style={[
        styles.metricTile,
        compact && styles.metricTileCompact,
        {
          backgroundColor: toneStyle.background,
          borderColor: toneStyle.border,
        },
      ]}
    >
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, compact && styles.metricValueCompact]}>
        {value}
      </Text>
      <Text style={[styles.metricHint, { color: toneStyle.text }]}>{hint}</Text>
    </View>
  );
}

export function StatusChip({ label, tone }: { label: string; tone: Tone }) {
  const toneStyle = TONE_STYLES[tone];

  return (
    <View
      style={[
        styles.statusChip,
        {
          backgroundColor: toneStyle.background,
          borderColor: toneStyle.border,
        },
      ]}
    >
      <Text style={[styles.statusChipText, { color: toneStyle.text }]}>
        {label}
      </Text>
    </View>
  );
}

export function ActionButton({
  label,
  onPress,
  small = false,
  tone = "primary",
}: {
  label: string;
  onPress: () => void;
  small?: boolean;
  tone?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const buttonStyles = getButtonStyles(tone);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        {
          backgroundColor: buttonStyles.backgroundColor,
          borderColor: buttonStyles.borderColor,
          opacity: pressed ? 0.88 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          small && styles.buttonLabelSmall,
          { color: buttonStyles.textColor },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function getButtonStyles(tone: "primary" | "secondary" | "ghost" | "danger") {
  if (tone === "secondary") {
    return {
      backgroundColor: "rgba(148, 163, 174, 0.08)",
      borderColor: "rgba(148, 163, 174, 0.18)",
      textColor: "#F4F7F8",
    };
  }

  if (tone === "ghost") {
    return {
      backgroundColor: "transparent",
      borderColor: "rgba(148, 163, 174, 0.18)",
      textColor: "#D3DBDF",
    };
  }

  if (tone === "danger") {
    return {
      backgroundColor: "#FF5252",
      borderColor: "#FF5252",
      textColor: "#12161A",
    };
  }

  return {
    backgroundColor: "#02C39A",
    borderColor: "#02C39A",
    textColor: "#081211",
  };
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    gap: Spacing.three,
  },
  orbPrimary: {
    position: "absolute",
    top: -80,
    right: -30,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: "rgba(2, 195, 154, 0.12)",
  },
  orbSecondary: {
    position: "absolute",
    top: 180,
    left: -80,
    width: 200,
    height: 200,
    borderRadius: 999,
    backgroundColor: "rgba(53, 194, 255, 0.08)",
  },
  pageHeader: {
    gap: Spacing.one,
    marginBottom: Spacing.one,
  },
  pageEyebrow: {
    color: "#02C39A",
    fontFamily: Fonts.mono,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  pageTitle: {
    color: "#F4F7F8",
    fontFamily: Fonts.rounded,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: 700,
  },
  pageSubtitle: {
    color: "#94A3AE",
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 18,
    gap: Spacing.three,
    overflow: "hidden",
  },
  sectionHeader: {
    gap: 6,
  },
  sectionTitle: {
    color: "#F4F7F8",
    fontFamily: Fonts.rounded,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 700,
  },
  sectionSubtitle: {
    color: "#94A3AE",
    fontSize: 14,
    lineHeight: 21,
  },
  metricTile: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    padding: Spacing.three,
    gap: 6,
  },
  metricTileCompact: {
    minHeight: 108,
  },
  metricLabel: {
    color: "#94A3AE",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  metricValue: {
    color: "#F4F7F8",
    fontFamily: Fonts.rounded,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: 700,
  },
  metricValueCompact: {
    fontSize: 18,
    lineHeight: 22,
  },
  metricHint: {
    fontSize: 13,
    lineHeight: 18,
  },
  statusChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: 700,
  },
  button: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonSmall: {
    flex: 0,
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: 700,
  },
  buttonLabelSmall: {
    fontSize: 13,
  },
});
