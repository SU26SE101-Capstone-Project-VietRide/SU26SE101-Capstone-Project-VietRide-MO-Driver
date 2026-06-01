import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Fonts, Spacing } from "@/constants/theme";
import {
    ActionButton,
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
import { useTheme } from "@/hooks/use-theme";

export function LoginScreen() {
  const router = useRouter();
  const theme = useTheme();
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
            Bạn có thể login bằng tài khoản mẫu của Driver hoặc Phụ xe và logout
            để chuyển role ngay trong app.
          </Text>
        </View>

        <SurfaceCard accent delay={0}>
          <SectionTitle
            title="Đăng nhập"
            subtitle="Form mock để test luồng auth, route guard và tabs theo role."
          />

          <View style={styles.inputStack}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="driver.minhquan@vietride.vn"
                placeholderTextColor="#6D7A83"
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
                placeholderTextColor="#6D7A83"
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
            subtitle="Bạn có thể điền sẵn credential hoặc đăng nhập nhanh để nhảy giữa 2 role."
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
                    label={account.role === "DRIVER" ? "Driver" : "Assistant"}
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

export function CrewSettingsScreen() {
  const router = useRouter();
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
    <ScrollView contentContainerStyle={styles.settingsContent}>
      <SurfaceCard accent delay={0}>
        <SectionTitle
          title="Tài khoản hiện tại"
          subtitle="Trang này đóng vai trò settings tab để bạn logout hoặc đổi nhanh giữa các role mẫu."
        />

        <View style={styles.accountHeader}>
          <View style={styles.accountCopy}>
            <Text style={styles.accountName}>{displayName}</Text>
            <Text style={styles.accountMeta}>{operatorName}</Text>
          </View>
          <StatusChip
            label={role === "DRIVER" ? "Driver" : "Assistant"}
            tone={role === "DRIVER" ? "primary" : "info"}
          />
        </View>

        <View style={styles.sessionSummary}>
          <Text style={styles.sessionLine}>Crew ID: {crewId}</Text>
          <Text style={styles.sessionLine}>
            Home route: {getHomeHrefForRole(role)}
          </Text>
        </View>

        <ActionButton label="Đăng xuất" tone="danger" onPress={handleLogout} />
      </SurfaceCard>

      <SurfaceCard delay={120}>
        <SectionTitle
          title="Chuyển tài khoản mẫu"
          subtitle="Nếu bạn muốn login qua lại giữa Driver và Assistant thì đổi ngay tại đây, không cần đổi env hay reload app."
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
                    label={account.role === "DRIVER" ? "Driver" : "Assistant"}
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
    </ScrollView>
  );
}

export function SettingsScreen() {
  return <CrewSettingsScreen />;
}

const styles = StyleSheet.create({
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
    color: "#02C39A",
    fontFamily: Fonts.mono,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  pageTitle: {
    color: "#F4F7F8",
    fontFamily: Fonts.rounded,
    fontSize: 32,
    fontWeight: 700,
    lineHeight: 38,
  },
  pageSubtitle: {
    color: "#B6C1C8",
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
    color: "#D3DBDF",
    fontSize: 14,
    fontWeight: 600,
  },
  input: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2C3942",
    backgroundColor: "#151B20",
    paddingHorizontal: Spacing.three,
    color: "#F4F7F8",
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
    color: "#F4F7F8",
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
    borderColor: "#2C3942",
    backgroundColor: "#151B20",
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
    color: "#F4F7F8",
    fontFamily: Fonts.rounded,
    fontSize: 18,
    fontWeight: 700,
  },
  accountMeta: {
    color: "#94A3AE",
    fontSize: 14,
    lineHeight: 20,
  },
  credentialWrap: {
    gap: 4,
  },
  credentialLabel: {
    color: "#94A3AE",
    fontFamily: Fonts.mono,
    fontSize: 12,
    textTransform: "uppercase",
  },
  credentialValue: {
    color: "#F4F7F8",
    fontSize: 14,
  },
  settingsContent: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.seven,
  },
  sessionSummary: {
    gap: Spacing.one,
  },
  sessionLine: {
    color: "#B6C1C8",
    fontSize: 14,
    lineHeight: 20,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.two,
    alignItems: "center",
  },
  switchRow: {
    flexDirection: "row",
    gap: Spacing.two,
    alignItems: "center",
  },
  ghostPressable: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 174, 0.18)",
  },
  ghostPressableText: {
    color: "#D3DBDF",
    fontSize: 14,
    fontWeight: 600,
  },
});
