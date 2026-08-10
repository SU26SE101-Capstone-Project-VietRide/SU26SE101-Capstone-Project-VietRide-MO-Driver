import { MaterialIcons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { ErrorCard, LoadingCard } from "@/components/query-state";
import { Fonts, Spacing, type Palette } from "@/constants/theme";
import {
    ActionButton,
    OperationsScreen,
    SectionTitle,
    StatusChip,
    SurfaceCard,
} from "@/features/operations/ui";
import {
    getHomeHrefForRole,
    useSession,
} from "@/features/session/session-context";
import {
    formatTimeHM,
    formatTripDayLabel,
    tripStatusMeta,
} from "@/features/trips/trip-format";
import { useSelectedTrip } from "@/features/trips/selected-trip-context";
import { useTripDetails } from "@/features/trips/use-trips";
import { useTheme, useThemedStyles } from "@/hooks/use-theme";

// Màn chi tiết một chuyến BẤT KỲ theo tripId — khác với tab "Chuyến"/"Đón khách"
// vốn khóa cứng vào chuyến đang chạy (useActiveTrip). Đây là đích của action
// OPEN_TRIP_DETAIL / OPEN_TRIP_TRACKING / OPEN_CREW_TRIP_BOOKING trong
// notification Phase 11: thông báo nói về chuyến nào thì mở đúng chuyến đó.
//
// Cố ý CHỈ ĐỌC: không phát GPS, không nút bắt đầu/hoàn tất. Các thao tác vận
// hành chỉ hợp lệ với chuyến đang chạy, nên khi đúng là chuyến đó thì màn này
// đưa người dùng sang tab điều hành thật thay vì nhân bản nút bấm.
export function TripDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const { role } = useSession();

  const params = useLocalSearchParams<{ tripId?: string }>();
  const tripId = typeof params.tripId === "string" ? params.tripId : null;

  const detailsQuery = useTripDetails(tripId);
  const details = detailsQuery.data;
  // So với chuyến ĐANG CHỌN chứ không phải chuyến app tự đoán: crew đã chuyển
  // sang ca khác thì "đang điều hành" phải là ca đó.
  const selectedTrip = useSelectedTrip();
  const isActiveTrip = tripId != null && selectedTrip.tripId === tripId;

  // Mở từ push lúc app đang tắt → stack rỗng, back() sẽ nổ "GO_BACK was not
  // handled" như màn Thông báo. Hết history thì về home theo role.
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(getHomeHrefForRole(role));
    }
  };

  const handleRefresh = () =>
    queryClient.invalidateQueries({ queryKey: ["trip", tripId] });

  const statusMeta = tripStatusMeta(details?.status);
  const routeLabel = details
    ? `${details.originStation.name ?? "Điểm đi"} → ${details.destinationStation.name ?? "Điểm đến"}`
    : "Đang tải thông tin chuyến…";

  const stops = details?.stops
    ? [...details.stops].sort((a, b) => a.orderIndex - b.orderIndex)
    : [];

  return (
    <OperationsScreen
      title="Chi tiết chuyến"
      subtitle={routeLabel}
      onBack={handleBack}
      onRefresh={handleRefresh}
    >
      {tripId == null ? (
        <SurfaceCard>
          <Text style={styles.message}>
            Thông báo này không kèm mã chuyến nên không mở được chi tiết.
          </Text>
        </SurfaceCard>
      ) : detailsQuery.isLoading ? (
        <LoadingCard label="Đang tải chi tiết chuyến…" />
      ) : detailsQuery.isError || !details ? (
        <ErrorCard
          message="Không tải được chuyến này. Có thể chuyến đã bị xóa hoặc bạn không còn được phân công."
          onRetry={() => void detailsQuery.refetch()}
        />
      ) : (
        <>
          {/* Tên tuyến đã nằm ở subtitle của header nên card không lặp lại,
              chỉ mang các thông tin còn thiếu: ngày, khung giờ, ghế. */}
          <SurfaceCard accent>
            <View style={styles.headerRow}>
              <StatusChip label={statusMeta.label} tone={statusMeta.tone} />
              {details.alternativeRouteId ? (
                <StatusChip label="Tuyến thay thế" tone="warning" />
              ) : null}
              {isActiveTrip ? (
                <Text style={styles.activeHint}>Chuyến đang điều hành</Text>
              ) : null}
            </View>

            <View style={styles.metaStack}>
              <View style={styles.metaRow}>
                <MaterialIcons
                  name="event"
                  size={16}
                  color={theme.textSecondary}
                />
                <Text style={styles.metaText}>
                  {formatTripDayLabel(details.departureDateTime)}
                </Text>
              </View>

              <View style={styles.metaRow}>
                <MaterialIcons
                  name="schedule"
                  size={16}
                  color={theme.textSecondary}
                />
                <Text style={styles.metaText}>
                  {formatTimeHM(details.departureDateTime)} –{" "}
                  {formatTimeHM(details.estimatedArrivalTime)}
                </Text>
              </View>

              <View style={styles.metaRow}>
                <MaterialIcons
                  name="event-seat"
                  size={16}
                  color={theme.textSecondary}
                />
                <Text style={styles.metaText}>
                  Còn {details.seatSummary.availableSeats}/
                  {details.seatSummary.totalSeats} ghế
                </Text>
              </View>
            </View>

            {isActiveTrip ? (
              <ActionButton
                icon="play-circle-outline"
                label={role === "DRIVER" ? "Mở màn chuyến" : "Mở màn đón khách"}
                onPress={() =>
                  router.replace(
                    role === "DRIVER" ? "/driver/trip" : "/assistant/boarding",
                  )
                }
              />
            ) : (
              <Text style={styles.note}>
                Chỉ xem thông tin — thao tác vận hành nằm ở chuyến đang chạy.
              </Text>
            )}
          </SurfaceCard>

          <SurfaceCard delay={60}>
            <SectionTitle
              icon="place"
              title="Điểm dừng"
              subtitle={`${stops.length} điểm trên tuyến`}
            />

            {stops.length === 0 ? (
              <Text style={styles.message}>
                Tuyến này không có điểm dừng trung gian.
              </Text>
            ) : (
              <View style={styles.stopStack}>
                {stops.map((stop) => {
                  const arrived = stop.status === "ARRIVED";
                  const skipped = stop.status === "SKIPPED";

                  return (
                    <View key={stop.stopId} style={styles.stopRow}>
                      <MaterialIcons
                        name={
                          arrived
                            ? "check-circle"
                            : skipped
                              ? "remove-circle-outline"
                              : "radio-button-unchecked"
                        }
                        size={20}
                        color={
                          arrived
                            ? theme.tones.success.text
                            : skipped
                              ? theme.textMeta
                              : theme.textSecondary
                        }
                      />
                      <View style={styles.stopBody}>
                        <Text style={styles.stopName}>
                          {stop.name ??
                            stop.address ??
                            `Điểm ${stop.orderIndex}`}
                        </Text>
                        <Text style={styles.stopMeta}>
                          {arrived && stop.actualArrivalTime
                            ? `Đã tới ${formatTimeHM(stop.actualArrivalTime)}`
                            : skipped
                              ? "Đã bỏ qua"
                              : `Dự kiến ${formatTimeHM(stop.estimatedArrivalTime)}`}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </SurfaceCard>
        </>
      )}
    </OperationsScreen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: Spacing.two,
    },
    activeHint: {
      color: c.tones.primary.text,
      fontFamily: Fonts.sans,
      fontSize: 12,
    },
    // SurfaceCard đã có gap giữa các con → không thêm marginTop, không thì
    // khoảng cách bị cộng dồn thành thưa gấp đôi.
    metaStack: {
      gap: Spacing.one,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    metaText: {
      flex: 1,
      color: c.text,
      fontFamily: Fonts.sans,
      fontSize: 15,
      lineHeight: 21,
    },
    note: {
      color: c.textMeta,
      fontFamily: Fonts.sans,
      fontSize: 13,
      lineHeight: 19,
    },
    message: {
      color: c.textMeta,
      fontFamily: Fonts.sans,
      fontSize: 14,
      lineHeight: 20,
    },
    stopStack: {
      gap: Spacing.two,
    },
    stopRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: Spacing.two,
    },
    stopBody: {
      flex: 1,
      gap: 2,
    },
    stopName: {
      color: c.text,
      fontFamily: Fonts.sans,
      fontSize: 15,
      fontWeight: "600",
      lineHeight: 21,
    },
    stopMeta: {
      color: c.textMeta,
      fontFamily: Fonts.sans,
      fontSize: 13,
      lineHeight: 18,
    },
  });
