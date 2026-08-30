import { MaterialIcons } from "@expo/vector-icons";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ComponentProps,
    type PropsWithChildren,
    type ReactNode,
} from "react";
import {
    Dimensions,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    type ViewStyle,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Fonts, Spacing, type Palette } from "@/constants/theme";
import { type Tone } from "@/features/operations/mock-data";
import { useSession } from "@/features/session/session-context";
import { useTheme, useThemedStyles } from "@/hooks/use-theme";

type MaterialIconName = ComponentProps<typeof MaterialIcons>["name"];


export function OperationsScreen({
  children,
  headerLeft,
  headerRight,
  onBack,
  onRefresh,
  subtitle,
  title,
}: PropsWithChildren<{
  // Hàng nút trên cùng: back + chuông bên trái, bánh răng Cài đặt bên phải.
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
  onBack?: () => void;
  // Kéo xuống để tải lại dữ liệu màn hình (BE không push realtime cho manifest/
  // parcel — booking mới từ khách chỉ hiện khi refetch). Promise resolve xong
  // thì spinner ẩn; lỗi refetch đã nằm trong state của từng query nên nuốt được.
  onRefresh?: () => Promise<unknown>;
  subtitle: string;
  title: string;
}>) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [refreshing, setRefreshing] = useState(false);
  const { role } = useSession();
  // Mỗi vai trò một nhãn + màu riêng để tài xế và phụ xe nhìn là biết đang ở
  // app nào, thay cho dòng "VietRide Operations" chung chung.
  const roleBadge =
    role === "ASSISTANT"
      ? {
          label: "Phụ xe",
          icon: "groups" as MaterialIconName,
          color: theme.tones.info.text,
        }
      : {
          label: "Tài xế",
          icon: "directions-bus" as MaterialIconName,
          color: theme.tones.primary.text,
        };

  const scrollRef = useRef<ScrollView>(null);
  const rootRef = useRef<View>(null);
  const keyboardOpen = useRef(false);
  // Android edge-to-edge (mặc định từ SDK 56) KHÔNG còn co cửa sổ theo bàn phím
  // nữa — adjustResize vô hiệu, bàn phím phủ đè lên ScrollView. Phải tự cộng
  // chiều cao bàn phím vào padding đáy thì nội dung mới cuộn lên trên nó được.
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Vị trí cuộn hiện tại + chiều cao bàn phím, giữ trong ref để tính toán mà
  // không kích hoạt render lại giữa lúc đang gõ.
  const scrollY = useRef(0);
  const keyboardTop = useRef(Number.POSITIVE_INFINITY);

  // Giữ ô ĐANG GÕ nằm trên bàn phím.
  //
  // Bản cũ luôn `scrollToEnd()` với giả định "form nào cũng nằm cuối màn". Giả
  // định đó sai ở màn Hàng hoá: panel cân/đo nằm trong card giữa danh sách, nên
  // mỗi lần gõ là màn nhảy xuống tận cuối danh sách, ô nhập biến mất khỏi tầm
  // mắt. Giờ đo đúng ô đang focus rồi chỉ cuộn vừa đủ để nó nổi trên bàn phím.
  const keepInputVisible = useCallback(() => {
    // Chỉ cuộn khi bàn phím đang mở (bàn phím mở ⇒ đang gõ ở đâu đó), tránh
    // giật màn khi nội dung đổi vì lý do khác — query trả về, card mở rộng…
    if (!keyboardOpen.current) {
      return;
    }

    const focused = TextInput.State.currentlyFocusedInput();
    if (!focused) {
      // Không xác định được ô nào đang gõ (bàn phím của WebView, ô ngoài
      // ScrollView…) → giữ hành vi cũ cho chắc.
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
      return;
    }

    // Hai nhịp: gõ xong layout chưa kịp co theo bàn phím, nhịp 300ms bù lại.
    const nudge = () => {
      focused.measureInWindow((_x, y, _width, height) => {
        // Chừa một khoảng thở dưới ô để còn thấy được viền và dòng gợi ý.
        const margin = Spacing.four;
        const overlap = y + height + margin - keyboardTop.current;
        if (overlap <= 0) {
          // Ô đã nằm trên bàn phím rồi thì ĐỪNG cuộn — cuộn thừa chính là cảm
          // giác "màn tự nhảy" mà người dùng thấy.
          return;
        }
        scrollRef.current?.scrollTo({
          y: scrollY.current + overlap,
          animated: false,
        });
      });
    };
    setTimeout(nudge, 50);
    setTimeout(nudge, 300);
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (event) => {
      keyboardOpen.current = true;

      // Bàn phím đo từ ĐÁY MÀN HÌNH, còn ScrollView kết thúc ở phía trên tab bar
      // → lấy nguyên endCoordinates.height là dư đúng chiều cao tab bar. Đo vị
      // trí đáy thật của màn rồi chỉ bù phần thực sự bị bàn phím chồng lên.
      rootRef.current?.measureInWindow((_x, y, _width, height) => {
        // "screen" chứ không phải "window": ở chế độ edge-to-edge, window height
        // đã trừ mất thanh điều hướng nên keyboardTop bị tính thấp đi, padding
        // thiếu đúng chiều cao thanh đó và nút Gửi vẫn bị cắt một nửa.
        // measureInWindow có lúc trả y âm (đo ngay trong lúc layout còn dịch
        // chuyển) → kẹp về 0, không thì padding thiếu đúng phần âm đó và nút
        // dưới cùng vẫn bị bàn phím cắt.
        const screenHeight = Dimensions.get("screen").height;
        const top = screenHeight - event.endCoordinates.height;
        keyboardTop.current = top;
        const bottom = Math.max(0, y) + height;
        setKeyboardHeight(Math.max(0, bottom - top));
        keepInputVisible();
      });
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      keyboardOpen.current = false;
      keyboardTop.current = Number.POSITIVE_INFINITY;
      setKeyboardHeight(0);
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, [keepInputVisible]);

  const handleRefresh = useCallback(() => {
    if (!onRefresh) {
      return;
    }
    setRefreshing(true);
    void Promise.resolve(onRefresh())
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  }, [onRefresh]);

  return (
    <KeyboardAvoidingView
      // iOS không tự co layout khi bàn phím hiện → phải đệm bằng padding.
      // Android đã có windowSoftInputMode=adjustResize nên để undefined, thêm
      // behavior vào là bị đẩy hai lần.
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.screen, { backgroundColor: theme.background }]}
    >
      {/* View đo đạc: KeyboardAvoidingView không cho gắn ref kiểu View nên đo
          trên lớp bọc bên trong (cùng kích thước). */}
      <View ref={rootRef} collapsable={false} style={styles.screen}>
        <View pointerEvents="none" style={styles.orbPrimary} />
        <View pointerEvents="none" style={styles.orbSecondary} />

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        // Ô mô tả là multiline, gõ dài thì nó cao dần xuống dưới và chui vào
        // vùng bàn phím → mỗi lần nội dung cao lên thì cuộn theo.
        onContentSizeChange={keepInputVisible}
        // Cần vị trí cuộn thật để tính "cuộn thêm bao nhiêu là vừa đủ".
        onScroll={(event) => {
          scrollY.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        // Bàn phím: tự chừa chỗ để ô nhập/nút bấm cuối form không bị che, và cho
        // phép chạm thẳng vào nút khi bàn phím đang mở (mặc định phải chạm 2 lần
        // — lần đầu chỉ để đóng bàn phím).
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.primary}
              colors={[theme.primary]}
              progressBackgroundColor={theme.backgroundElement}
            />
          ) : undefined
        }
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, Spacing.four),
            // Tab bar là sibling nằm dưới TabSlot (không phủ lên nội dung) nên
            // KHÔNG cộng thêm BottomTabInset — cộng vào là thừa ra cả một khoảng
            // trắng bằng chiều cao tab bar. insets.bottom cho các màn ngoài tab
            // (Cài đặt) vì lúc đó ScrollView chạm đáy máy.
            // Bàn phím mở thì chính nó đã phủ lên thanh điều hướng → cộng thêm
            // insets.bottom nữa là thừa ra một mảng trống.
            paddingBottom:
              (keyboardHeight > 0 ? keyboardHeight : insets.bottom) +
              Spacing.four,
          },
        ]}
      >
        <View style={styles.pageHeader}>
          {/* Nhãn vai trò nằm chung hàng với nút chuông/cài đặt để không chừa
              khoảng trống bên trái, tiêu đề tụt xuống ngay dưới. */}
          <View style={styles.pageHeaderTop}>
            {onBack ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Quay lại"
                hitSlop={8}
                onPress={onBack}
                style={styles.backButton}
              >
                <MaterialIcons name="arrow-back" size={22} color={theme.text} />
              </Pressable>
            ) : null}
            {headerLeft}
            <View style={styles.pageBadge}>
              <MaterialIcons
                name={roleBadge.icon}
                size={14}
                color={roleBadge.color}
              />
              <Text style={[styles.pageEyebrow, { color: roleBadge.color }]}>
                {roleBadge.label}
              </Text>
            </View>
            <View style={styles.pageHeaderActions}>{headerRight}</View>
          </View>
          <View style={styles.pageHeaderTitles}>
            <Text style={styles.pageTitle}>{title}</Text>
          </View>
          <Text style={styles.pageSubtitle}>{subtitle}</Text>
        </View>
          {children}
        </ScrollView>

        {/* Android bật edge-to-edge nên nội dung cuộn lên sẽ chạy dưới thanh
            trạng thái (giờ/pin/sóng đè lên chữ). Dải này che đúng chiều cao safe
            area trên cùng, vẽ đè lên ScrollView. */}
        <View
          pointerEvents="none"
          style={[
            styles.statusBarScrim,
            { height: insets.top, backgroundColor: theme.background },
          ]}
        />
      </View>
    </KeyboardAvoidingView>
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
      // Fade + trượt lên 10px trong 220ms. Trước dùng springify() nên card nảy
      // lên xuống mỗi lần đổi màn, nhìn giật; bỏ spring cho mượt.
      entering={FadeInDown.delay(delay).duration(220).withInitialValues({
        transform: [{ translateY: 10 }],
      })}
      style={[
        styles.card,
        {
          backgroundColor: accent
            ? theme.backgroundAccent
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
    statusBarScrim: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
    },
    pageHeader: {
      gap: Spacing.one,
      marginBottom: Spacing.one,
    },
    backButton: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.backgroundElement,
      borderWidth: 1,
      borderColor: c.border,
    },
    pageHeaderTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
      marginBottom: Spacing.one,
    },
    pageHeaderActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
      // Đẩy cụm nút về sát mép phải, nhãn vai trò giữ chỗ bên trái.
      marginLeft: "auto",
    },
    pageBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: c.backgroundElement,
      borderWidth: 1,
      borderColor: c.border,
    },
    pageHeaderTitles: {
      gap: Spacing.one,
    },
    pageEyebrow: {
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
      // Không để chip bị bóp méo khi nằm cạnh khối chữ dài.
      flexShrink: 0,
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
