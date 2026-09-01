import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { setInitialPassword } from "@/api/auth";
import { authErrorMessage } from "@/features/session/auth-errors";
import { KeyboardAwareScroll } from "@/components/keyboard-aware-scroll";
import { Fonts, Spacing, type Palette } from "@/constants/theme";
import {
    ActionButton,
    SectionTitle,
    StatusChip,
    SurfaceCard,
} from "@/features/operations/ui";
import { useTheme, useThemedStyles } from "@/hooks/use-theme";

const MIN_PASSWORD_LENGTH = 8;

// Màn kích hoạt tài khoản crew, mở từ deep link trong email mời:
// https://vietride.online/auth/set-password?token=… (hoặc vietride://auth/set-password?token=…)
export function SetPasswordScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === "string" ? params.token.trim() : "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  const handleSubmit = async () => {
    if (submitting) {
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(
        `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`,
      );
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Mật khẩu nhập lại không khớp.");
      return;
    }

    setErrorMessage(null);
    setSubmitting(true);

    try {
      await setInitialPassword(token, password);
      setSucceeded(true);
    } catch (error) {
      // Field message của backend là tiếng Anh → map theo mã lỗi, không
      // hiển thị thô.
      setErrorMessage(authErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const renderBody = () => {
    if (!token) {
      return (
        <SurfaceCard accent delay={0}>
          <SectionTitle title="Liên kết không hợp lệ" />
          <View style={styles.messageBanner}>
            <StatusChip label="Thiếu mã kích hoạt" tone="danger" />
            <Text style={styles.messageText}>
              Liên kết này không chứa mã kích hoạt. Vui lòng mở lại đường dẫn
              &quot;Thiết lập mật khẩu&quot; trong email mà nhà xe đã gửi, hoặc
              liên hệ nhà xe để được gửi lại email.
            </Text>
          </View>
          <View style={styles.actionRow}>
            <ActionButton
              label="Về màn đăng nhập"
              tone="ghost"
              onPress={() => router.replace("/login")}
            />
          </View>
        </SurfaceCard>
      );
    }

    if (succeeded) {
      return (
        <SurfaceCard accent delay={0}>
          <SectionTitle title="Kích hoạt thành công" />
          <View style={styles.messageBanner}>
            <StatusChip label="Tài khoản đã sẵn sàng" tone="success" />
            <Text style={styles.messageText}>
              Mật khẩu đã được thiết lập. Đăng nhập bằng email và mật khẩu vừa
              tạo để bắt đầu làm việc.
            </Text>
          </View>
          <View style={styles.actionRow}>
            <ActionButton
              icon="login"
              label="Đăng nhập ngay"
              tone="primary"
              onPress={() => router.replace("/login")}
            />
          </View>
        </SurfaceCard>
      );
    }

    return (
      <SurfaceCard accent delay={0}>
        <SectionTitle title="Tạo mật khẩu" />

        <View style={styles.inputStack}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Mật khẩu mới</Text>
            <View style={styles.passwordField}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Tối thiểu 8 ký tự"
                placeholderTextColor={theme.placeholder}
                secureTextEntry={!showPassword}
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                }
                hitSlop={8}
                onPress={() => setShowPassword((visible) => !visible)}
                style={styles.passwordToggle}
              >
                <MaterialIcons
                  name={showPassword ? "visibility-off" : "visibility"}
                  size={22}
                  color={theme.textSecondary}
                />
              </Pressable>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Nhập lại mật khẩu</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="••••••••"
              placeholderTextColor={theme.placeholder}
              secureTextEntry={!showPassword}
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
          </View>
        </View>

        {errorMessage ? (
          <View style={styles.errorBanner}>
            <StatusChip label="Không thể thiết lập" tone="danger" />
            <Text style={styles.messageText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <ActionButton
            label={submitting ? "Đang thiết lập…" : "Thiết lập mật khẩu"}
            tone="primary"
            disabled={submitting}
            onPress={() => void handleSubmit()}
          />
        </View>
      </SurfaceCard>
    );
  };

  return (
    // Màn này nằm ngoài OperationsScreen nên phải tự bọc KeyboardAwareScroll,
    // không thì ô mật khẩu và nút submit nằm dưới bàn phím (Android edge-to-edge
    // không còn co cửa sổ theo bàn phím nữa).
    <KeyboardAwareScroll
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      paddingTop={Math.max(insets.top, Spacing.five)}
      extraBottomPadding={Spacing.five}
      background={
        <>
          <View pointerEvents="none" style={styles.orbPrimary} />
          <View pointerEvents="none" style={styles.orbSecondary} />
        </>
      }
    >
      <View style={styles.pageHeader}>
        <Text style={styles.pageEyebrow}>VietRide Crew Access</Text>
        <Text style={styles.pageTitle}>Thiết lập mật khẩu</Text>
        <Text style={styles.pageSubtitle}>
          Tạo mật khẩu cho tài khoản tài xế / phụ xe để bắt đầu sử dụng app.
        </Text>
      </View>

      {renderBody()}
    </KeyboardAwareScroll>
  );
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
    passwordField: {
      justifyContent: "center",
    },
    passwordInput: {
      paddingRight: 52,
    },
    passwordToggle: {
      position: "absolute",
      right: Spacing.three,
    },
    errorBanner: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.tones.danger.border,
      backgroundColor: c.tones.danger.background,
      padding: Spacing.three,
      gap: Spacing.two,
    },
    messageBanner: {
      gap: Spacing.two,
    },
    messageText: {
      color: c.text,
      fontSize: 14,
      lineHeight: 20,
    },
    actionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: Spacing.two,
    },
  });
