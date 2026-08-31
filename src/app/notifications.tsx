import { MaterialIcons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorCard, LoadingCard } from "@/components/query-state";
import { Fonts, Spacing, type Palette } from "@/constants/theme";
import {
    invalidationKeysForAction,
    parseNotificationAction,
    resolveActionHref,
} from "@/features/notifications/notification-action";
import {
    formatRelativeTime,
    localizeNotificationText,
    notificationBadgeOf,
    notificationToneOf,
} from "@/features/notifications/notification-format";
import {
    hasIncidentCoordinates,
    incidentLocationLabel,
    openIncidentInMaps,
    parseVehicleSubstitution,
    type VehicleSubstitutionInfo,
} from "@/features/notifications/vehicle-substitution";
import { encodeWaypointsParam } from "@/features/routes/waypoints";
import {
    useMarkAllNotificationsReadMutation,
    useMarkNotificationReadMutation,
    useNotificationList,
    useUnreadNotificationsCount,
} from "@/features/notifications/use-notifications";
import {
    NOTIFICATION_COLOR,
    NOTIFICATION_ICON,
} from "@/features/operations/role-screens";
import {
    getHomeHrefForRole,
    useSession,
} from "@/features/session/session-context";
import { useTheme, useThemedStyles } from "@/hooks/use-theme";

const ALL_FILTER = "Tất cả";

export default function NotificationsScreen() {
  const router = useRouter();
  const { role } = useSession();
  const insets = useSafeAreaInsets();

  // Màn Thông báo dùng chung, có thể được mở như route gốc (tap push notification,
  // deep link) → khi đó stack không còn màn phía dưới. router.back() lúc này sẽ nổ
  // "GO_BACK was not handled". Nên back có điều kiện: hết history thì về home theo role.
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(getHomeHrefForRole(role));
    }
  };
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [page, setPage] = useState(1);
  const listQuery = useNotificationList({ page });
  const unreadNotificationsCount = useUnreadNotificationsCount();
  const markRead = useMarkNotificationReadMutation();
  const markAllRead = useMarkAllNotificationsReadMutation();
  const queryClient = useQueryClient();

  // Kéo xuống để tải lại danh sách + badge chưa đọc (invalidate cả nhóm
  // ["notifications"] nên list lẫn unread-count cùng refetch).
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = () => {
    setRefreshing(true);
    void queryClient
      .invalidateQueries({ queryKey: ["notifications"] })
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  };

  // Chốt "bây giờ" theo lần data đổi để format thời gian tương đối khi render.
  const now = useMemo(() => new Date().getTime(), []);

  const notifications = useMemo(
    () =>
      (listQuery.data?.items ?? []).map((item) => ({
        id: item.id,
        // BE còn gửi chuỗi lẫn tiếng Anh ("booking", "check-in") → dịch nốt ở
        // tầng hiển thị, app 100% tiếng Việt.
        title: localizeNotificationText(item.title),
        body: localizeNotificationText(item.body),
        badge: notificationBadgeOf(item.type),
        tone: notificationToneOf(item.type),
        time: formatRelativeTime(item.createdAt, now),
        read: item.readAt != null,
        // Phase 11: điều hướng theo action của BE, không tự suy từ title/body.
        action: parseNotificationAction(item.action),
        // Đổi xe do sự cố: payload có xe/chuyến mới + vị trí sự cố để crew
        // thay thế chạy tới. Loại khác trả null → không vẽ khối phụ.
        substitution: parseVehicleSubstitution(item.type, item.data),
      })),
    [listQuery.data, now],
  );

  // API không có endpoint "đọc tất cả" → gửi song song các item chưa đọc của
  // trang hiện tại, cache đổi ngay nên UI không phải chờ mạng.
  const handleMarkAllRead = () => {
    const unreadIds = (listQuery.data?.items ?? [])
      .filter((item) => item.readAt == null)
      .map((item) => item.id);

    if (unreadIds.length > 0) {
      markAllRead.mutate(unreadIds);
    }
  };

  // Chạm một thông báo: đánh dấu đã đọc rồi đi thẳng tới màn nghiệp vụ theo
  // action (Phase 11). Action không có màn đích trong app crew (ví, gói đăng ký,
  // NONE) → ở lại inbox, user vẫn đọc được nội dung ngay tại đây.
  const handleOpen = (notification: (typeof notifications)[number]) => {
    if (!notification.read) {
      markRead.mutate(notification.id);
    }

    for (const queryKey of invalidationKeysForAction(notification.action)) {
      void queryClient.invalidateQueries({ queryKey });
    }

    const href = resolveActionHref(notification.action, role);
    if (href) {
      router.push(href);
    }
  };

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
            onPress={handleBack}
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
            onPress={handleMarkAllRead}
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
            colors={[theme.primary]}
            progressBackgroundColor={theme.backgroundElement}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + Spacing.four },
        ]}
      >
        {listQuery.isLoading ? (
          <LoadingCard label="Đang tải thông báo…" />
        ) : listQuery.isError ? (
          <ErrorCard onRetry={() => void listQuery.refetch()} />
        ) : visibleNotifications.length === 0 ? (
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
                entering={FadeInDown.delay(index * 40)
                  .duration(220)
                  .withInitialValues({ transform: [{ translateY: 10 }] })}
              >
                <Pressable
                  accessibilityRole="button"
                  onPress={() => handleOpen(notification)}
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

                    {/* Đổi xe do sự cố: xe/chuyến được gán + vị trí sự cố.
                        Thiếu toạ độ thì chỉ hiện mô tả, KHÔNG hiện "null, null"
                        và cũng không vẽ tuyến cứu hộ nào. */}
                    {notification.substitution ? (
                      <VehicleSubstitutionBlock
                        info={notification.substitution}
                      />
                    ) : null}
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

        {/* Phân trang đơn giản theo page/totalPages từ API. */}
        {listQuery.data && listQuery.data.totalPages > 1 ? (
          <View style={styles.pagerRow}>
            {page > 1 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setPage((current) => Math.max(1, current - 1))}
                style={styles.readAllButton}
              >
                <Text style={styles.readAllText}>Trang trước</Text>
              </Pressable>
            ) : null}
            {listQuery.data.hasNextPage ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setPage((current) => current + 1)}
                style={styles.readAllButton}
              >
                <Text style={styles.readAllText}>
                  Trang sau ({page}/{listQuery.data.totalPages})
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

// Khối phụ của thông báo đổi xe do sự cố: xe được gán + vị trí sự cố + nút mở
// bản đồ ngoài (MOBILE-VEHICLE-SUBSTITUTION-PARCEL-TRANSFER.md). Thiếu toạ độ
// thì chỉ hiện mô tả — không bao giờ hiện chuỗi "null, null" — và app không tự
// dựng tuyến cứu hộ hay tracking riêng cho đoạn crew đi tới sự cố.
function VehicleSubstitutionBlock({ info }: { info: VehicleSubstitutionInfo }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const router = useRouter();

  return (
    <View style={styles.substitutionBox}>
      {info.newVehiclePlateNumber ? (
        <View style={styles.substitutionRow}>
          <MaterialIcons
            name="directions-bus"
            size={15}
            color={theme.textSecondary}
          />
          <Text style={styles.substitutionText}>
            Xe thay thế: {info.newVehiclePlateNumber}
          </Text>
        </View>
      ) : null}
      <View style={styles.substitutionRow}>
        <MaterialIcons name="place" size={15} color={theme.textSecondary} />
        <Text style={styles.substitutionText}>
          {incidentLocationLabel(info)}
        </Text>
      </View>
      {hasIncidentCoordinates(info) ? (
        <>
          {/* Dẫn đường TRONG APP bằng Mapbox, giống màn Trung chuyển — crew
              đang gấp, bung sang app bản đồ ngoài rồi quay lại là mất mạch.
              Đây là dẫn đường phía client từ vị trí hiện tại, KHÔNG tạo
              dispatchId/tuyến cứu hộ/tracking riêng như doc cấm. */}
          <Pressable
            accessibilityRole="button"
            style={styles.mapButton}
            onPress={() =>
              router.push({
                pathname: "/turn-by-turn",
                params: {
                  points: encodeWaypointsParam([
                    {
                      latitude: info.latitude as number,
                      longitude: info.longitude as number,
                    },
                  ]),
                },
              })
            }
          >
            <MaterialIcons name="navigation" size={16} color={theme.onAccent} />
            <Text style={styles.mapButtonText}>Dẫn đường tới điểm sự cố</Text>
          </Pressable>
          {/* Giữ đường thoát sang app bản đồ ngoài: máy yếu, hoặc tài xế quen
              dùng Google Maps thì vẫn mở được. */}
          <Pressable
            accessibilityRole="button"
            style={styles.mapAltButton}
            onPress={() => void openIncidentInMaps(info)}
          >
            <MaterialIcons name="map" size={16} color={theme.textSecondary} />
            <Text style={styles.mapAltText}>Mở bằng app bản đồ khác</Text>
          </Pressable>
        </>
      ) : null}
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
      backgroundColor: c.backgroundElement,
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
    // Khối phụ của thông báo đổi xe: xe/chuyến mới + vị trí sự cố.
    substitutionBox: {
      marginTop: Spacing.two,
      gap: 6,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      backgroundColor: c.backgroundElement,
      padding: Spacing.two,
    },
    substitutionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    substitutionText: {
      color: c.textSecondary,
      flex: 1,
      fontSize: 13,
      lineHeight: 19,
    },
    mapButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: 999,
      backgroundColor: c.primary,
      paddingVertical: 8,
      paddingHorizontal: Spacing.three,
    },
    mapAltButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      paddingVertical: 8,
      paddingHorizontal: Spacing.three,
    },
    mapAltText: {
      color: c.textSecondary,
      fontSize: 12,
      fontWeight: 600,
    },
    mapButtonText: {
      color: c.onAccent,
      fontSize: 13,
      fontWeight: 700,
    },
    unreadDot: {
      width: 9,
      height: 9,
      borderRadius: 999,
      backgroundColor: c.primary,
      marginTop: 4,
    },
    pagerRow: {
      flexDirection: "row",
      justifyContent: "center",
      gap: Spacing.two,
      paddingTop: Spacing.two,
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
