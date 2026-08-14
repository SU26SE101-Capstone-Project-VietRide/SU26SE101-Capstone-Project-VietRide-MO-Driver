import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ApiError } from "@/api/client";
import { changePassword } from "@/api/auth";
import { Spacing, type Palette } from "@/constants/theme";
import {
    ActionButton,
    OperationsScreen,
    SectionTitle,
    StatusChip,
    SurfaceCard,
} from "@/features/operations/ui";
import { authErrorMessage } from "@/features/session/auth-errors";
import { validatePassword } from "@/features/session/password-policy";
import { useSession } from "@/features/session/session-context";
import { useTheme, useThemedStyles } from "@/hooks/use-theme";

// Map lỗi theo ngữ cảnh đổi mật khẩu (FE-RESPONSE-LOCKDRIVER-PASSWORD.md §6.4):
// AUTH_INVALID_CREDENTIALS ở đây nghĩa là mật khẩu HIỆN TẠI sai (khác màn login).
function changePasswordErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "AUTH_INVALID_CREDENTIALS") {
      return "Mật khẩu hiện tại không đúng.";
    }
    if (error.code === "USER_INVALID_STATUS_TRANSITION") {
      return "Tài khoản không ở trạng thái cho phép đổi mật khẩu. Liên hệ nhà xe.";
    }
    if (error.code === "VALIDATION_ERROR") {
      return "Mật khẩu mới chưa hợp lệ: cần 8–128 ký tự, có chữ và số, khác mật khẩu hiện tại.";
    }
  }
  return authErrorMessage(error);
}

// Màn đổi mật khẩu khi đã đăng nhập (dùng chung driver/assistant). Sau khi đổi
// thành công BE revoke toàn bộ refresh token → app xóa session và về Login,
// KHÔNG gọi refresh bằng token cũ (doc §6.3).
export function ChangePasswordScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { logout } = useSession();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (submitting) {
      return;
    }

    // Validate sớm cho đỡ một vòng API; BE vẫn là lớp kiểm tra cuối.
    // KHÔNG trim/biến đổi password (doc §6.2).
    if (!currentPassword) {
      setErrorMessage("Nhập mật khẩu hiện tại.");
      return;
    }
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setErrorMessage(passwordError);
      return;
    }
    if (newPassword === currentPassword) {
      setErrorMessage("Mật khẩu mới phải khác mật khẩu hiện tại.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage("Mật khẩu nhập lại không khớp.");
      return;
    }

    setErrorMessage(null);
    setSubmitting(true);

    try {
      await changePassword(currentPassword, newPassword);
      // BE đã revoke mọi refresh token (sessionsRevoked) → dọn sạch phiên
      // local (push token, query cache, tokens) rồi về màn đăng nhập.
      Alert.alert(
        "Đổi mật khẩu thành công",
        "Vui lòng đăng nhập lại bằng mật khẩu mới.",
      );
      await logout();
      router.replace("/login");
    } catch (error) {
      setErrorMessage(changePasswordErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const passwordField = (
    label: string,
    value: string,
    onChange: (text: string) => void,
    placeholder: string,
  ) => (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={placeholder}
        placeholderTextColor={theme.placeholder}
        secureTextEntry={!showPasswords}
        style={styles.input}
        value={value}
        onChangeText={onChange}
      />
    </View>
  );

  return (
    <OperationsScreen
      title="Đổi mật khẩu"
      subtitle="Sau khi đổi phải đăng nhập lại trên mọi thiết bị"
      onBack={() => router.back()}
    >
      <SurfaceCard accent delay={0}>
        <SectionTitle
          icon="lock"
          title="Mật khẩu đăng nhập"
          subtitle="Mật khẩu mới cần 8–128 ký tự, có ít nhất 1 chữ cái và 1 chữ số."
        />

        <View style={styles.inputStack}>
          {passwordField(
            "Mật khẩu hiện tại",
            currentPassword,
            setCurrentPassword,
            "••••••••",
          )}
          {passwordField(
            "Mật khẩu mới",
            newPassword,
            setNewPassword,
            "Ít nhất 8 ký tự, có chữ và số",
          )}
          {passwordField(
            "Nhập lại mật khẩu mới",
            confirmPassword,
            setConfirmPassword,
            "••••••••",
          )}

          <Pressable
            accessibilityRole="button"
            onPress={() => setShowPasswords((visible) => !visible)}
            style={styles.toggleRow}
          >
            <MaterialIcons
              name={showPasswords ? "visibility-off" : "visibility"}
              size={18}
              color={theme.textSecondary}
            />
            <Text style={styles.toggleText}>
              {showPasswords ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            </Text>
          </Pressable>
        </View>

        {errorMessage ? (
          <View style={styles.errorBanner}>
            <StatusChip label="Chưa đổi được" tone="danger" />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <ActionButton
          icon="lock-reset"
          label={submitting ? "Đang đổi mật khẩu…" : "Đổi mật khẩu"}
          tone="primary"
          disabled={submitting}
          onPress={() => void handleSubmit()}
        />
      </SurfaceCard>
    </OperationsScreen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
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
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.one,
      alignSelf: "flex-start",
    },
    toggleText: {
      color: c.textSecondary,
      fontSize: 14,
    },
    errorBanner: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.tones.danger.border,
      backgroundColor: c.tones.danger.background,
      padding: Spacing.three,
      gap: Spacing.two,
    },
    errorText: {
      color: c.text,
      fontSize: 14,
      lineHeight: 20,
    },
  });
