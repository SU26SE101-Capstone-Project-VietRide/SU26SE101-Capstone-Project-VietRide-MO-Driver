import { MaterialIcons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Fonts, Spacing, type Palette } from "@/constants/theme";
import { NotificationBell } from "@/features/operations/role-screens";
import {
    ActionButton,
    OperationsScreen,
    SectionTitle,
    StatusChip,
    SurfaceCard,
} from "@/features/operations/ui";
import {
    getHomeHrefForRole,
    useAuthenticatedSession,
    useSession,
} from "@/features/session/session-context";
import { useThemeMode } from "@/features/theme/theme-mode";
import { useTheme, useThemedStyles } from "@/hooks/use-theme";

export function LoginScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { isAuthenticated, login, role } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Redirect href={getHomeHrefForRole(role)} />;
  }

  const handleLogin = async () => {
    if (submitting) {
      return;
    }

    setErrorMessage(null);
    setSubmitting(true);

    try {
      const result = await login(email, password);

      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }

      router.replace(getHomeHrefForRole(result.session.role));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View pointerEvents="none" style={styles.orbPrimary} />
      <View pointerEvents="none" style={styles.orbSecondary} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, Spacing.five),
            paddingBottom: Math.max(insets.bottom, Spacing.five),
          },
        ]}
      >
        <View style={styles.pageHeader}>
          <Text style={styles.pageEyebrow}>VietRide Crew Access</Text>
          <Text style={styles.pageTitle}>Đăng nhập điều hành chuyến</Text>
          <Text style={styles.pageSubtitle}>
            Đăng nhập bằng tài khoản tài xế hoặc phụ xe do nhà xe cấp.
          </Text>
        </View>

        <SurfaceCard accent delay={0}>
          <SectionTitle title="Đăng nhập" />

          <View style={styles.inputStack}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="email@nhaxe.vn"
                placeholderTextColor={theme.placeholder}
                style={styles.input}
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Mật khẩu</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="••••••••"
                placeholderTextColor={theme.placeholder}
                secureTextEntry
                style={styles.input}
                value={password}
                onChangeText={setPassword}
              />
            </View>
          </View>

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <StatusChip label="Đăng nhập thất bại" tone="danger" />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.actionRow}>
            <ActionButton
              label={submitting ? "Đang đăng nhập…" : "Đăng nhập"}
              tone="primary"
              disabled={submitting}
              onPress={() => void handleLogin()}
            />
            <ActionButton
              label="Quên mật khẩu?"
              tone="ghost"
              disabled={submitting}
              onPress={() => router.push("/auth/forgot-password")}
            />
          </View>
        </SurfaceCard>
      </ScrollView>
    </View>
  );
}

const THEME_OPTIONS = [
  { key: "dark", label: "Tối", icon: "dark-mode" },
  { key: "light", label: "Sáng", icon: "light-mode" },
] as const;

export function CrewSettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { mode, setMode } = useThemeMode();
  const { logout } = useSession();
  const { crewId, displayName, operatorName, role } = useAuthenticatedSession();

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <OperationsScreen
      title="Cài đặt"
      subtitle="Tài khoản và phiên làm việc"
      // Cài đặt mở từ header nên nằm ngoài tab bar → cần nút quay lại.
      onBack={() => (router.canGoBack() ? router.back() : router.replace(getHomeHrefForRole(role)))}
      headerRight={<NotificationBell />}
    >
      <SurfaceCard accent delay={0}>
        <SectionTitle icon="account-circle" title="Tài khoản hiện tại" />

        <View style={styles.accountHeader}>
          <View style={styles.accountCopy}>
            <Text style={styles.accountName}>{displayName}</Text>
            {operatorName ? (
              <Text style={styles.accountMeta}>{operatorName}</Text>
            ) : null}
          </View>
          <StatusChip
            label={role === "DRIVER" ? "Tài xế" : "Phụ xe"}
            tone={role === "DRIVER" ? "primary" : "info"}
          />
        </View>

        <View style={styles.sessionSummary}>
          <Text style={styles.sessionLine}>
            Mã nhân sự: {crewId.slice(0, 8)}…
          </Text>
        </View>

        <ActionButton
          icon="logout"
          label="Đăng xuất"
          tone="ghost"
          onPress={() => void handleLogout()}
        />
      </SurfaceCard>

      <SurfaceCard delay={60}>
        <SectionTitle
          icon="palette"
          title="Giao diện"
          subtitle="Chọn chế độ hiển thị sáng hoặc tối."
        />

        <View style={styles.segment}>
          {THEME_OPTIONS.map((option) => {
            const active = mode === option.key;

            return (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                onPress={() => setMode(option.key)}
                style={[
                  styles.segmentItem,
                  active && styles.segmentItemActive,
                ]}
              >
                <MaterialIcons
                  name={option.icon}
                  size={18}
                  color={active ? theme.onAccent : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.segmentText,
                    active && styles.segmentTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SurfaceCard>

      {role === "ASSISTANT" ? (
        <SurfaceCard delay={90}>
          <SectionTitle
            icon="report"
            title="Báo cáo sự cố"
            subtitle="Gửi sự cố, tai nạn về điều hành kèm vị trí và mô tả."
          />

          <ActionButton
            icon="report"
            label="Mở báo cáo sự cố"
            tone="danger"
            onPress={() => router.push("/assistant/incident")}
          />
        </SurfaceCard>
      ) : null}
    </OperationsScreen>
  );
}

export function SettingsScreen() {
  return <CrewSettingsScreen />;
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: {
      flex: 1,
    },
    orbPrimary: {
      position: "absolute",
      top: -80,
      right: -40,
      width: 220,
      height: 220,
      borderRadius: 999,
      backgroundColor: "rgba(2, 195, 154, 0.12)",
    },
    orbSecondary: {
      position: "absolute",
      bottom: 40,
      left: -60,
      width: 180,
      height: 180,
      borderRadius: 999,
      backgroundColor: "rgba(53, 194, 255, 0.08)",
    },
    content: {
      gap: Spacing.three,
      paddingHorizontal: Spacing.three,
    },
    pageHeader: {
      gap: Spacing.one,
      paddingTop: Spacing.one,
      paddingBottom: Spacing.two,
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
      fontSize: 32,
      fontWeight: 700,
      lineHeight: 38,
    },
    pageSubtitle: {
      color: c.textMeta,
      fontSize: 15,
      lineHeight: 24,
    },
    inputStack: {
      gap: Spacing.three,
    },
    inputGroup: {
      gap: Spacing.two,
    },
    inputLabel: {
      color: c.textGhost,
      fontSize: 14,
      fontWeight: 600,
    },
    input: {
      minHeight: 54,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      paddingHorizontal: Spacing.three,
      color: c.text,
      fontSize: 15,
    },
    errorBanner: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: "rgba(255, 82, 82, 0.24)",
      backgroundColor: "rgba(255, 82, 82, 0.08)",
      padding: Spacing.three,
      gap: Spacing.two,
    },
    errorText: {
      color: c.text,
      fontSize: 14,
      lineHeight: 20,
    },
    actionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: Spacing.two,
    },
    accountHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: Spacing.two,
      alignItems: "flex-start",
    },
    accountCopy: {
      flex: 1,
      gap: 4,
    },
    accountName: {
      color: c.text,
      fontFamily: Fonts.rounded,
      fontSize: 18,
      fontWeight: 700,
    },
    accountMeta: {
      color: c.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    sessionSummary: {
      gap: Spacing.one,
    },
    sessionLine: {
      color: c.textMeta,
      fontSize: 14,
      lineHeight: 20,
    },
    segment: {
      flexDirection: "row",
      gap: 4,
      padding: 4,
      borderRadius: 14,
      backgroundColor: c.tones.neutral.background,
    },
    segmentItem: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
    },
    segmentItemActive: {
      backgroundColor: c.primary,
    },
    segmentText: {
      color: c.textSecondary,
      fontSize: 14,
      fontWeight: 700,
    },
    segmentTextActive: {
      color: c.onAccent,
    },
  });
