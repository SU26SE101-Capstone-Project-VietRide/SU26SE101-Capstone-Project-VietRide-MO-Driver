import { MaterialIcons } from "@expo/vector-icons";
import {
    type ComponentProps,
    type PropsWithChildren,
    type ReactNode,
} from "react";
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

import { BottomTabInset, Fonts, Spacing, type Palette } from "@/constants/theme";
import { type Tone } from "@/features/operations/mock-data";
import { useTheme, useThemedStyles } from "@/hooks/use-theme";

type MaterialIconName = ComponentProps<typeof MaterialIcons>["name"];

export function OperationsScreen({
  children,
  headerRight,
  subtitle,
  title,
}: PropsWithChildren<{
  headerRight?: ReactNode;
  subtitle: string;
  title: string;
}>) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

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
          <View style={styles.pageHeaderTop}>
            <View style={styles.pageHeaderTitles}>
              <Text style={styles.pageEyebrow}>VietRide Operations</Text>
              <Text style={styles.pageTitle}>{title}</Text>
            </View>
            {headerRight}
          </View>
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
  const styles = useThemedStyles(makeStyles);

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
  icon,
  subtitle,
  title,
}: {
  icon?: MaterialIconName;
  subtitle?: string;
  title: string;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.sectionHeaderRow}>
      {icon ? (
        <View style={styles.sectionIcon}>
          <MaterialIcons name={icon} size={20} color={theme.primary} />
        </View>
      ) : null}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? (
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        ) : null}
      </View>
    </View>
  );
}

export function MetricTile({
  compact = false,
  hint,
  icon,
  label,
  tone,
  value,
}: {
  compact?: boolean;
  hint?: string;
  icon?: MaterialIconName;
  label?: string;
  tone: Tone;
  value: string;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const toneStyle = theme.tones[tone];

  return (
    <View
      style={[
        styles.metricTile,
        compact && styles.metricTileCompact,
        icon != null && styles.metricTileIcon,
        {
          backgroundColor: toneStyle.background,
          borderColor: toneStyle.border,
        },
      ]}
    >
      {icon ? (
        <MaterialIcons name={icon} size={22} color={toneStyle.text} />
      ) : label ? (
        <Text style={styles.metricLabel}>{label}</Text>
      ) : null}
      <Text
        style={[
          styles.metricValue,
          compact && styles.metricValueCompact,
          icon != null && styles.metricValueIcon,
        ]}
      >
        {value}
      </Text>
      {hint ? (
        <Text
          style={[
            styles.metricHint,
            icon != null && styles.metricHintIcon,
            { color: toneStyle.text },
          ]}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function StatusChip({ label, tone }: { label: string; tone: Tone }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const toneStyle = theme.tones[tone];

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
  disabled = false,
  icon,
  label,
  onPress,
  small = false,
  tone = "primary",
}: {
  disabled?: boolean;
  icon?: MaterialIconName;
  label: string;
  onPress: () => void;
  small?: boolean;
  tone?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const buttonStyles = getButtonStyles(tone, theme);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        {
          backgroundColor: buttonStyles.backgroundColor,
          borderColor: buttonStyles.borderColor,
          opacity: disabled ? 0.4 : pressed ? 0.88 : 1,
          transform: [{ scale: pressed && !disabled ? 0.985 : 1 }],
        },
      ]}
    >
      <View style={styles.buttonContent}>
        {icon ? (
          <MaterialIcons
            name={icon}
            size={small ? 16 : 18}
            color={buttonStyles.textColor}
          />
        ) : null}
        <Text
          style={[
            styles.buttonLabel,
            small && styles.buttonLabelSmall,
            { color: buttonStyles.textColor },
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function getButtonStyles(
  tone: "primary" | "secondary" | "ghost" | "danger",
  c: Palette,
) {
  if (tone === "secondary") {
    return {
      backgroundColor: c.tones.neutral.background,
      borderColor: c.border,
      textColor: c.text,
    };
  }

  if (tone === "ghost") {
    return {
      backgroundColor: "transparent",
      borderColor: c.border,
      textColor: c.textGhost,
    };
  }

  if (tone === "danger") {
    return {
      backgroundColor: c.danger,
      borderColor: c.danger,
      textColor: c.onAccent,
    };
  }

  return {
    backgroundColor: c.primary,
    borderColor: c.primary,
    textColor: c.onAccent,
  };
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
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
    pageHeaderTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: Spacing.two,
    },
    pageHeaderTitles: {
      flex: 1,
      gap: Spacing.one,
    },
    pageEyebrow: {
      color: c.primary,
      fontFamily: Fonts.mono,
      fontSize: 12,
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    pageTitle: {
      color: c.text,
      fontFamily: Fonts.rounded,
      fontSize: 30,
      lineHeight: 36,
      fontWeight: 700,
    },
    pageSubtitle: {
      color: c.textSecondary,
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
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: Spacing.two,
    },
    sectionIcon: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.tones.primary.background,
      borderWidth: 1,
      borderColor: c.tones.primary.border,
    },
    sectionHeader: {
      flex: 1,
      gap: 6,
    },
    sectionTitle: {
      color: c.text,
      fontFamily: Fonts.rounded,
      fontSize: 22,
      lineHeight: 28,
      fontWeight: 700,
    },
    sectionSubtitle: {
      color: c.textSecondary,
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
    metricTileIcon: {
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
    },
    metricValueIcon: {
      textAlign: "center",
    },
    metricHintIcon: {
      textAlign: "center",
    },
    metricLabel: {
      color: c.textSecondary,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    metricValue: {
      color: c.text,
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
    buttonContent: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    buttonLabel: {
      fontSize: 15,
      fontWeight: 700,
    },
    buttonLabelSmall: {
      fontSize: 13,
    },
  });
