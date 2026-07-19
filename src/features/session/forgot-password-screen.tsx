import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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

import { forgotPassword, resetPassword } from "@/api/auth";
import { ApiError } from "@/api/client";
import { Fonts, Spacing, type Palette } from "@/constants/theme";
import {
    ActionButton,
    SectionTitle,
    StatusChip,
    SurfaceCard,
} from "@/features/operations/ui";
import { useTheme, useThemedStyles } from "@/hooks/use-theme";

// Ràng buộc mật khẩu khớp ResetPasswordCommandValidator của backend:
// tối thiểu 8, tối đa 128 ký tự, có ít nhất 1 chữ cái VÀ 1 chữ số.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const OTP_LENGTH = 6;

type Step = "request" | "reset" | "done";

// Trả về thông báo lỗi mật khẩu đầu tiên, hoặc null nếu hợp lệ.
function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Mật khẩu tối đa ${MAX_PASSWORD_LENGTH} ký tự.`;
  }
  if (!/[a-zA-Z]/.test(password)) {
    return "Mật khẩu phải có ít nhất 1 chữ cái.";
  }
  if (!/\d/.test(password)) {
    return "Mật khẩu phải có ít nhất 1 chữ số.";
  }
  return null;
}

// Gộp lỗi field (nếu backend trả) rồi fallback message chung.
function messageFromError(error: unknown): string {
  if (error instanceof ApiError) {
    const fieldMessage = error.fields?.map((field) => field.message).join("\n");
    return fieldMessage || error.message;
  }
  return "Có lỗi xảy ra, thử lại sau.";
}

// Màn "Quên mật khẩu": nhập email nhận OTP → nhập OTP + mật khẩu mới.
export function ForgotPasswordScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otpTtlMinutes, setOtpTtlMinutes] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleRequestOtp = async () => {
    if (submitting) {
      return;
    }

    if (!email.trim()) {
      setErrorMessage("Vui lòng nhập email.");
      return;
    }

    setErrorMessage(null);
    setSubmitting(true);

    try {
      const data = await forgotPassword(email);
      setOtpTtlMinutes(data.otpTtlMinutes);
      setStep("reset");
    } catch (error) {
      setErrorMessage(messageFromError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (submitting) {
      return;
    }

    if (!/^\d{6}$/.test(code.trim())) {
      setErrorMessage(`Mã OTP gồm ${OTP_LENGTH} chữ số.`);
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setErrorMessage(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Mật khẩu nhập lại không khớp.");
      return;
    }

    setErrorMessage(null);
    setSubmitting(true);

    try {
      await resetPassword(email, code, password);
      setStep("done");
    } catch (error) {
      setErrorMessage(messageFromError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const renderRequest = () => (
    <SurfaceCard accent delay={0}>
      <SectionTitle title="Nhập email tài khoản" />

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
      </View>

      {errorMessage ? (
        <View style={styles.errorBanner}>
          <StatusChip label="Không gửi được" tone="danger" />
          <Text style={styles.messageText}>{errorMessage}</Text>
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <ActionButton
          label={submitting ? "Đang gửi…" : "Gửi mã OTP"}
          tone="primary"
          disabled={submitting}
          onPress={() => void handleRequestOtp()}
        />
        <ActionButton
          label="Về đăng nhập"
          tone="ghost"
          onPress={() => router.replace("/login")}
        />
      </View>
    </SurfaceCard>
  );

  const renderReset = () => (
    <SurfaceCard accent delay={0}>
      <SectionTitle title="Nhập OTP & mật khẩu mới" />

      <View style={styles.messageBanner}>
        <StatusChip label="Đã gửi mã (nếu email hợp lệ)" tone="info" />
        <Text style={styles.messageText}>
          Nếu email thuộc tài khoản hợp lệ, mã OTP {OTP_LENGTH} chữ số đã được gửi
          tới hộp thư
          {otpTtlMinutes ? ` và có hiệu lực trong ${otpTtlMinutes} phút` : ""}.
          Kiểm tra cả mục spam.
        </Text>
      </View>

      <View style={styles.inputStack}>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Mã OTP</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            placeholder="______"
            placeholderTextColor={theme.placeholder}
            style={[styles.input, styles.otpInput]}
            value={code}
            onChangeText={(text) => setCode(text.replace(/\D/g, ""))}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Mật khẩu mới</Text>
          <View style={styles.passwordField}>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Tối thiểu 8 ký tự, có chữ và số"
              placeholderTextColor={theme.placeholder}
              secureTextEntry={!showPassword}
              style={[styles.input, styles.passwordInput]}
              value={password}
              onChangeText={setPassword}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
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
          <StatusChip label="Không thể đặt lại" tone="danger" />
          <Text style={styles.messageText}>{errorMessage}</Text>
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <ActionButton
          label={submitting ? "Đang đặt lại…" : "Đặt lại mật khẩu"}
          tone="primary"
          disabled={submitting}
          onPress={() => void handleResetPassword()}
        />
        <ActionButton
          label="Gửi lại mã"
          tone="ghost"
          disabled={submitting}
          onPress={() => void handleRequestOtp()}
        />
      </View>
    </SurfaceCard>
  );

  const renderDone = () => (
    <SurfaceCard accent delay={0}>
      <SectionTitle title="Đặt lại thành công" />
      <View style={styles.messageBanner}>
        <StatusChip label="Mật khẩu đã được cập nhật" tone="success" />
        <Text style={styles.messageText}>
          Mật khẩu mới đã sẵn sàng. Các phiên đăng nhập cũ đã bị thu hồi, hãy đăng
          nhập lại bằng mật khẩu vừa tạo.
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
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.pageHeader}>
          <Text style={styles.pageEyebrow}>VietRide Crew Access</Text>
          <Text style={styles.pageTitle}>Quên mật khẩu</Text>
          <Text style={styles.pageSubtitle}>
            Đặt lại mật khẩu tài khoản tài xế / phụ xe bằng mã OTP gửi qua email.
          </Text>
        </View>

        {step === "request" ? renderRequest() : null}
        {step === "reset" ? renderReset() : null}
        {step === "done" ? renderDone() : null}
      </ScrollView>
    </View>
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
    otpInput: {
      letterSpacing: 8,
      fontFamily: Fonts.mono,
      fontSize: 20,
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
      borderColor: "rgba(255, 82, 82, 0.24)",
      backgroundColor: "rgba(255, 82, 82, 0.08)",
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
