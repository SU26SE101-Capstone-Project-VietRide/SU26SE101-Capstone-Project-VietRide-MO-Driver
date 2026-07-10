import { MaterialIcons } from "@expo/vector-icons";
import { type ComponentProps } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Spacing, type Palette } from "@/constants/theme";
import { ActionButton, SurfaceCard } from "@/features/operations/ui";
import { useTheme, useThemedStyles } from "@/hooks/use-theme";

// Card trạng thái dùng chung cho các màn gọi API: loading / lỗi / rỗng.

export function LoadingCard({ label = "Đang tải dữ liệu…" }: { label?: string }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <SurfaceCard delay={0}>
      <View style={styles.center}>
        <ActivityIndicator color={theme.primary} />
        <Text style={styles.text}>{label}</Text>
      </View>
    </SurfaceCard>
  );
}

export function ErrorCard({
  message = "Không tải được dữ liệu. Kiểm tra mạng rồi thử lại.",
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <SurfaceCard delay={0}>
      <View style={styles.center}>
        <MaterialIcons name="cloud-off" size={28} color={theme.textSecondary} />
        <Text style={styles.text}>{message}</Text>
        <ActionButton label="Thử lại" tone="secondary" small onPress={onRetry} />
      </View>
    </SurfaceCard>
  );
}

export function EmptyCard({
  icon = "inbox",
  message,
}: {
  icon?: ComponentProps<typeof MaterialIcons>["name"];
  message: string;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <SurfaceCard delay={0}>
      <View style={styles.center}>
        <MaterialIcons name={icon} size={28} color={theme.textSecondary} />
        <Text style={styles.text}>{message}</Text>
      </View>
    </SurfaceCard>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    center: {
      alignItems: "center",
      gap: Spacing.two,
      paddingVertical: Spacing.three,
    },
    text: {
      color: c.textMeta,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
    },
  });
