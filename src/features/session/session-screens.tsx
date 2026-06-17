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
    SAMPLE_CREW_ACCOUNTS,
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
  const { isAuthenticated, login, loginAs, role } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (isAuthenticated) {
    return <Redirect href={getHomeHrefForRole(role)} />;
  }

  const handleLogin = () => {
    setErrorMessage(null);

    const result = login(email, password);

    if (!result.ok) {
      setErrorMessage(result.error);
      return;
    }

    router.replace(getHomeHrefForRole(result.session.role));
  };

  const handleQuickLogin = (accountId: string) => {
    const nextSession = loginAs(accountId);

    if (!nextSession) {
      setErrorMessage("Không tìm thấy tài khoản mẫu tương ứng.");
      return;
    }

    setErrorMessage(null);
    router.replace(getHomeHrefForRole(nextSession.role));
  };

  const seedCredentials = (accountId: string) => {
    const matchedAccount = SAMPLE_CREW_ACCOUNTS.find(
      (account) => account.accountId === accountId,
    );

    if (!matchedAccount) {
      return;
    }

    setEmail(matchedAccount.email);
    setPassword(matchedAccount.password);
    setErrorMessage(null);
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
            Đăng nhập bằng tài khoản mẫu của tài xế hoặc phụ xe, có thể đăng xuất
            để đổi vai trò ngay trong app.
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
                placeholder="driver.minhquan@vietride.vn"
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
                placeholder="Driver@123"
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
              label="Đăng nhập"
              tone="primary"
              onPress={handleLogin}
            />
          </View>
        </SurfaceCard>

        <SurfaceCard delay={120}>
          <SectionTitle
            title="Tài khoản mẫu"
            subtitle="Điền sẵn thông tin hoặc đăng nhập nhanh để đổi giữa 2 vai trò."
          />

          <View style={styles.accountList}>
            {SAMPLE_CREW_ACCOUNTS.map((account) => (
              <View key={account.accountId} style={styles.accountCard}>
                <View style={styles.accountHeader}>
                  <View style={styles.accountCopy}>
                    <Text style={styles.accountName}>
                      {account.displayName}
                    </Text>
                    <Text style={styles.accountMeta}>
                      {account.operatorName}
                    </Text>
                  </View>
                  <StatusChip
                    label={account.role === "DRIVER" ? "Tài xế" : "Phụ xe"}
                    tone={account.role === "DRIVER" ? "primary" : "info"}
                  />
                </View>

                <View style={styles.credentialWrap}>
                  <Text style={styles.credentialLabel}>Email</Text>
                  <Text style={styles.credentialValue}>{account.email}</Text>
                </View>

                <View style={styles.credentialWrap}>
                  <Text style={styles.credentialLabel}>Mật khẩu</Text>
                  <Text style={styles.credentialValue}>{account.password}</Text>
                </View>

                <View style={styles.actionRow}>
                  <ActionButton
                    label="Điền sẵn"
                    tone="secondary"
                    small
                    onPress={() => seedCredentials(account.accountId)}
                  />
                  <ActionButton
                    label="Đăng nhập nhanh"
                    tone="primary"
                    small
                    onPress={() => handleQuickLogin(account.accountId)}
                  />
                </View>
              </View>
            ))}
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
  const { accounts, loginAs, logout } = useSession();
  const { crewId, displayName, operatorName, role } = useAuthenticatedSession();

  const handleSwitchAccount = (accountId: string) => {
    const nextSession = loginAs(accountId);

    if (!nextSession) {
      return;
    }

    router.replace(getHomeHrefForRole(nextSession.role));
  };

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <OperationsScreen
      title="Cài đặt"
      subtitle="Tài khoản và phiên làm việc"
      headerRight={<NotificationBell />}
    >
      <SurfaceCard accent delay={0}>
        <SectionTitle icon="account-circle" title="Tài khoản hiện tại" />

        <View style={styles.accountHeader}>
          <View style={styles.accountCopy}>
            <Text style={styles.accountName}>{displayName}</Text>
            <Text style={styles.accountMeta}>{operatorName}</Text>
          </View>
          <StatusChip
            label={role === "DRIVER" ? "Tài xế" : "Phụ xe"}
            tone={role === "DRIVER" ? "primary" : "info"}
          />
        </View>

        <View style={styles.sessionSummary}>
          <Text style={styles.sessionLine}>Mã nhân sự: {crewId}</Text>
        </View>

        <ActionButton
          icon="logout"
          label="Đăng xuất"
          tone="ghost"
          onPress={handleLogout}
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

      <SurfaceCard delay={120}>
        <SectionTitle
          icon="swap-horiz"
          title="Đổi tài khoản"
          subtitle="Chuyển nhanh giữa các tài khoản mẫu."
        />

        <View style={styles.accountList}>
          {accounts.map((account) => {
            const isCurrentAccount = account.crewId === crewId;

            return (
              <View key={account.accountId} style={styles.accountCard}>
                <View style={styles.accountHeader}>
                  <View style={styles.accountCopy}>
                    <Text style={styles.accountName}>
                      {account.displayName}
                    </Text>
                    <Text style={styles.accountMeta}>{account.email}</Text>
                  </View>
                  <StatusChip
                    label={account.role === "DRIVER" ? "Tài xế" : "Phụ xe"}
                    tone={account.role === "DRIVER" ? "primary" : "info"}
                  />
                </View>

                <View style={styles.rowBetween}>
                  <Text style={styles.sessionLine}>{account.operatorName}</Text>
                  {isCurrentAccount ? (
                    <StatusChip label="Đang dùng" tone="success" />
                  ) : null}
                </View>

                <View style={styles.actionRow}>
                  <ActionButton
                    label={
                      isCurrentAccount
                        ? "Đang đăng nhập"
                        : "Chuyển sang tài khoản này"
                    }
                    tone={isCurrentAccount ? "ghost" : "primary"}
                    small
                    onPress={() => handleSwitchAccount(account.accountId)}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </SurfaceCard>
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
    accountList: {
      gap: Spacing.three,
    },
    accountCard: {
      gap: Spacing.two,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      padding: Spacing.three,
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
    credentialWrap: {
      gap: 4,
    },
    credentialLabel: {
      color: c.textSecondary,
      fontFamily: Fonts.mono,
      fontSize: 12,
      textTransform: "uppercase",
    },
    credentialValue: {
      color: c.text,
      fontSize: 14,
    },
    sessionSummary: {
      gap: Spacing.one,
    },
    sessionLine: {
      color: c.textMeta,
      fontSize: 14,
      lineHeight: 20,
    },
    rowBetween: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: Spacing.two,
      alignItems: "center",
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
