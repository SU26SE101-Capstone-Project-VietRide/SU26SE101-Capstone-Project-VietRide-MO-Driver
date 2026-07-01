import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Fonts, Spacing, type Palette } from "@/constants/theme";
import { useOperations } from "@/features/operations/operations-context";
import {
    NOTIFICATION_COLOR,
    NOTIFICATION_ICON,
} from "@/features/operations/role-screens";
import { useTheme, useThemedStyles } from "@/hooks/use-theme";

const ALL_FILTER = "Tất cả";

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const {
    notifications,
    unreadNotificationsCount,
    markNotificationRead,
    markAllNotificationsRead,
  } = useOperations();

  // Danh sách bộ lọc = "Tất cả" + các loại (badge) duy nhất theo thứ tự xuất hiện.
  const filters = useMemo(() => {
    const categories: string[] = [];
    for (const notification of notifications) {
      if (!categories.includes(notification.badge)) {
        categories.push(notification.badge);
      }
    }
    return [ALL_FILTER, ...categories];
  }, [notifications]);

  const [activeFilter, setActiveFilter] = useState(ALL_FILTER);

  const visibleNotifications =
    activeFilter === ALL_FILTER
      ? notifications
      : notifications.filter(
          (notification) => notification.badge === activeFilter,
        );

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View pointerEvents="none" style={styles.orbPrimary} />

      {/* Header tự dựng: nút back + tiêu đề + nút "Đọc tất cả". */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <View style={styles.headerTop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            hitSlop={8}
            onPress={() => router.back()}
            style={styles.iconButton}
          >
            <MaterialIcons name="arrow-back" size={22} color={theme.text} />
          </Pressable>
          <View style={styles.headerTitles}>
            <Text style={styles.headerTitle}>Thông báo điều hành</Text>
            <Text style={styles.headerSubtitle}>
              {unreadNotificationsCount > 0
                ? `${unreadNotificationsCount} thông báo chưa đọc`
                : "Bạn đã đọc hết thông báo"}
            </Text>
          </View>
        </View>

        {unreadNotificationsCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={markAllNotificationsRead}
            style={styles.readAllButton}
          >
            <MaterialIcons name="done-all" size={16} color={theme.primary} />
            <Text style={styles.readAllText}>Đọc tất cả</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Thanh lọc theo loại thông báo. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {filters.map((filter) => {
          const active = filter === activeFilter;
          return (
            <Pressable
              key={filter}
              accessibilityRole="button"
              onPress={() => setActiveFilter(filter)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  active && styles.filterChipTextActive,
                ]}
              >
                {filter}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + Spacing.four },
        ]}
      >
        {visibleNotifications.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons
              name="notifications-off"
              size={36}
              color={theme.textSecondary}
            />
            <Text style={styles.emptyText}>
              Không có thông báo loại này.
            </Text>
          </View>
        ) : (
          visibleNotifications.map((notification, index) => {
            const accent = NOTIFICATION_COLOR[notification.tone];

            return (
              <Animated.View
                key={notification.id}
                entering={FadeInDown.delay(index * 60)
                  .springify()
                  .damping(18)}
              >
                <Pressable
                  accessibilityRole="button"
                  onPress={() => markNotificationRead(notification.id)}
                  style={[
                    styles.item,
                    notification.read
                      ? styles.itemRead
                      : [styles.itemUnread, { borderLeftColor: accent }],
                  ]}
                >
                  <View
                    style={[
                      styles.itemIcon,
                      { backgroundColor: `${accent}22` },
                    ]}
                  >
                    <MaterialIcons
                      name={NOTIFICATION_ICON[notification.tone]}
                      size={20}
                      color={accent}
                    />
                  </View>

                  <View style={styles.itemBody}>
                    <View style={styles.itemHeaderRow}>
                      <View
                        style={[
                          styles.itemBadge,
                          { backgroundColor: `${accent}22` },
                        ]}
                      >
                        <Text style={[styles.itemBadgeText, { color: accent }]}>
                          {notification.badge}
                        </Text>
                      </View>
                      <Text style={styles.itemTime}>{notification.time}</Text>
                    </View>

                    <Text
                      style={[
                        styles.itemTitle,
                        notification.read && styles.itemTitleRead,
                      ]}
                    >
                      {notification.title}
                    </Text>
                    <Text style={styles.itemText}>{notification.body}</Text>
                  </View>

                  {/* Chấm xanh = chưa đọc. */}
                  {!notification.read ? (
                    <View style={styles.unreadDot} />
                  ) : null}
                </Pressable>
              </Animated.View>
            );
          })
        )}
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
      right: -30,
      width: 220,
      height: 220,
      borderRadius: 999,
      backgroundColor: "rgba(2, 195, 154, 0.12)",
    },
    header: {
      paddingHorizontal: 20,
      paddingBottom: Spacing.three,
      gap: Spacing.three,
    },
    headerTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.tones.neutral.background,
      borderWidth: 1,
      borderColor: c.border,
    },
    headerTitles: {
      flex: 1,
      gap: 2,
    },
    headerTitle: {
      color: c.text,
      fontFamily: Fonts.rounded,
      fontSize: 22,
      lineHeight: 28,
      fontWeight: 700,
    },
    headerSubtitle: {
      color: c.textSecondary,
      fontSize: 13,
    },
    readAllButton: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: c.tones.primary.background,
      borderWidth: 1,
      borderColor: c.tones.primary.border,
    },
    readAllText: {
      color: c.primary,
      fontSize: 13,
      fontWeight: 700,
    },
    filterScroll: {
      flexGrow: 0,
    },
    filterRow: {
      paddingHorizontal: 20,
      gap: Spacing.two,
      paddingBottom: Spacing.three,
    },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: c.tones.neutral.background,
      borderWidth: 1,
      borderColor: c.border,
    },
    filterChipActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    filterChipText: {
      color: c.textSecondary,
      fontSize: 13,
      fontWeight: 700,
    },
    filterChipTextActive: {
      color: c.onAccent,
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingHorizontal: 20,
      gap: Spacing.two,
    },
    item: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: Spacing.two,
      borderRadius: 18,
      borderWidth: 1,
      padding: Spacing.three,
      backgroundColor: c.backgroundElement,
      borderColor: c.border,
      // Bóng nhẹ để card nổi khỏi nền (item không bị clip overflow nên bóng hiện).
      shadowColor: "#212529",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 2,
    },
    // Chưa đọc: viền trái dày màu theo loại + nền hơi đậm hơn để bắt mắt.
    itemUnread: {
      borderLeftWidth: 4,
      backgroundColor: c.surface,
    },
    // Đã đọc: làm mờ nhẹ cho khác biệt.
    itemRead: {
      opacity: 0.6,
    },
    itemIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    itemBody: {
      flex: 1,
      gap: 4,
    },
    itemHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: Spacing.two,
    },
    itemBadge: {
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    itemBadgeText: {
      fontSize: 11,
      fontWeight: 700,
    },
    itemTime: {
      color: c.textSecondary,
      fontSize: 12,
    },
    itemTitle: {
      color: c.text,
      fontFamily: Fonts.rounded,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: 700,
    },
    itemTitleRead: {
      fontWeight: 600,
    },
    itemText: {
      color: c.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },
    unreadDot: {
      width: 9,
      height: 9,
      borderRadius: 999,
      backgroundColor: c.primary,
      marginTop: 4,
    },
    emptyState: {
      alignItems: "center",
      gap: Spacing.two,
      paddingVertical: Spacing.six,
    },
    emptyText: {
      color: c.textSecondary,
      fontSize: 14,
    },
  });
