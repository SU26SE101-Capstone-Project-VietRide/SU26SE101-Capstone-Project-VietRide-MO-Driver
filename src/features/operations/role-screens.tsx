import { MaterialIcons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState, type ComponentProps } from "react";
import {
    Alert,
    Image,
    Linking,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import { ApiError } from "@/api/client";
import type { ReweighParcelInput } from "@/api/parcel";
import { sendRagFeedback, streamRagChat } from "@/api/rag";
import {
  INCIDENT_CATEGORIES,
  type AssistantParcelItem,
  type IncidentCategory,
  type BookingUpdatedEvent,
  type RagRating,
  type ReportIncidentData,
  type SeatCell,
  type TripDetails,
  type TripTargetEta,
} from "@/api/types";
import { EmptyCard, ErrorCard, LoadingCard } from "@/components/query-state";
import { Fonts, Spacing, type Palette } from "@/constants/theme";
import { QrScannerModal } from "@/features/boarding/qr-scanner";
import {
    groupManifestByBooking,
    isBoardedStatus,
    useManifest,
    useQrScanMutation,
} from "@/features/boarding/use-boarding";
import {
    type ScheduleEntry,
    type Tone,
} from "@/features/operations/mock-data";
import { SUPPORT_QUICK_PROMPTS } from "@/features/operations/operations-context";
import { useUnreadNotificationsCount } from "@/features/notifications/use-notifications";
import {
    formatTimeHM,
    isoDateOf,
    mapAssignmentRoleLabel,
    normalizeTripStatus,
    tripStatusMeta,
} from "@/features/trips/trip-format";
import {
    useActiveTrip,
    useDriverSchedule,
    useSeatMap,
    useTripDetails,
    useTripDetailsMany,
} from "@/features/trips/use-trips";
import {
    ActionButton,
    MetricTile,
    OperationsScreen,
    SectionTitle,
    StatusChip,
    SurfaceCard,
} from "@/features/operations/ui";
import {
  allowedParcelActions,
  formatVnd,
  parcelStatusMeta,
  sizeCategoryLabel,
} from "@/features/parcels/parcel-format";
import { TripRouteMap } from "@/features/routes/trip-route-map";
import { useTripRouteGeometry } from "@/features/routes/use-route";
import { ShuttleScheduleSection } from "@/features/shuttle/shuttle-schedule-section";
import { EvidenceCameraModal } from "@/features/parcels/evidence-camera";
import {
  MAX_EVIDENCE_PHOTOS,
  uploadEvidencePhotos,
} from "@/features/parcels/evidence-upload";
import {
  useAssistantTripParcels,
  useCheckInParcel,
  useConfirmParcelDelivery,
  useConfirmParcelTransfer,
  useDeliverParcel,
  useLoadParcel,
  useResendDeliveryEmail,
  useReweighParcel,
  useScanParcelQr,
  useUnloadParcel,
} from "@/features/parcels/use-parcels";
import {
  useAuthenticatedSession,
  useSession,
} from "@/features/session/session-context";
import {
  firstErrorMessage,
  tripOpsErrorMessage,
} from "@/features/trip-ops/trip-ops-errors";
import {
  getCurrentCoords,
  useArriveAtDestination,
  useArriveAtStop,
  useLocationPermission,
  useCompleteTrip,
  useReportIncident,
  useStartTrip,
} from "@/features/trip-ops/use-trip-ops";
import {
  TRACKING_ENABLED,
  useGpsBroadcast,
  type GpsBroadcastStatus,
} from "@/features/tracking/use-gps-broadcast";
import { buildSimulationPath } from "@/features/tracking/fake-gps-route";
import { useTripEta, useTripEtas } from "@/features/tracking/use-tracking";
import { useTheme, useThemedStyles } from "@/hooks/use-theme";

// Tách batch ETA realtime thành map theo stopId + ETA bến đích (STATION).
// Batch đại diện toàn bộ target còn lại tại lần tính — stop không có trong
// batch thì không có ETA realtime, màn hình fallback về planned ETA.
function splitEtaBatch(etas: TripTargetEta[] | undefined): {
  byStopId: Map<string, TripTargetEta>;
  station: TripTargetEta | null;
} {
  const byStopId = new Map<string, TripTargetEta>();
  let station: TripTargetEta | null = null;

  for (const eta of etas ?? []) {
    if (eta.targetKind === "STATION") {
      station = eta;
    } else if (eta.stopId) {
      byStopId.set(eta.stopId, eta);
    }
  }

  return { byStopId, station };
}

// Dòng mô tả ETA realtime: "Còn X phút • đến HH:MM", thêm "(ước tính)" khi
// estimateQuality=FALLBACK (không có dữ liệu giao thông — vẫn hợp lệ để hiển
// thị). Timestamp lấy nguyên từ server, KHÔNG tự cộng Date.now() + etaMinutes.
function liveEtaLine(eta: TripTargetEta): string {
  const base = `Còn ${eta.etaMinutes} phút • đến ${formatTimeHM(eta.estimatedArrivalTime)}`;
  return eta.estimateQuality === "FALLBACK" ? `${base} (ước tính)` : base;
}

// Câu thông báo cho banner booking:updated. BOOKING_CREATED trả null vì đã có
// banner riêng giàu thông tin hơn từ booking:created (legacy, BE vẫn giữ).
function bookingUpdateBannerText(event: BookingUpdatedEvent): string | null {
  switch (event.reason) {
    case "BOOKING_CANCELLED":
      return `Có booking vừa bị hủy${event.bookingCode ? ` (${event.bookingCode})` : ""}. Danh sách ghế đã được làm mới.`;
    case "PASSENGER_BOARDED":
      return "Có hành khách vừa được xác nhận lên xe.";
    case "BOOKING_TRANSFERRED":
      return "Có booking vừa được chuyển chuyến hoặc đổi ghế do đổi xe. Danh sách ghế đã được làm mới.";
    default:
      return null;
  }
}

// Tóm tắt tuyến dạng dọc kiểu timeline: mỗi bến một hàng full-width để tên
// dài ("605 Đ. Lý Thường Kiệt"…) không bị bẻ đôi trong 2 cột hẹp như trước.
function RouteSummary({
  originName,
  destinationName,
}: {
  originName: string | null | undefined;
  destinationName: string | null | undefined;
}) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();

  return (
    <View style={styles.routeSummary}>
      <View style={styles.routeEndpointRow}>
        <MaterialIcons name="trip-origin" size={18} color={theme.primary} />
        <View style={styles.routeEndpoint}>
          <Text style={styles.routeEndpointLabel}>Điểm đi</Text>
          <Text style={styles.routeEndpointName} numberOfLines={2}>
            {originName ?? "—"}
          </Text>
        </View>
      </View>
      <View style={styles.routeConnector} />
      <View style={styles.routeEndpointRow}>
        <MaterialIcons name="place" size={18} color={theme.primary} />
        <View style={styles.routeEndpoint}>
          <Text style={styles.routeEndpointLabel}>Điểm đến</Text>
          <Text style={styles.routeEndpointName} numberOfLines={2}>
            {destinationName ?? "—"}
          </Text>
        </View>
      </View>
    </View>
  );
}

// Ngưỡng nhắc xác nhận đã đến: distanceMeters do SERVER tính trong ETA batch
// (FE không tự tính khoảng cách). Phải > 50m vì BE loại stop khỏi batch khi
// xe cách dưới 50m — nhắc xong phải giữ (sticky) tới khi stop được chốt.
const ARRIVAL_PROMPT_DISTANCE_M = 300;

// Nhãn + tone cho trạng thái phát GPS ở màn chuyến đang chạy.
function gpsStatusMeta(status: GpsBroadcastStatus): {
  label: string;
  tone: Tone;
} {
  switch (status) {
    case "tracking":
      return { label: "Đang phát", tone: "success" };
    case "connecting":
      return { label: "Đang kết nối…", tone: "info" };
    case "requesting-permission":
      return { label: "Đang xin quyền…", tone: "info" };
    case "denied":
      return { label: "Chưa cấp quyền", tone: "danger" };
    case "error":
      return { label: "Lỗi kết nối", tone: "danger" };
    default:
      return { label: "Chưa bật", tone: "neutral" };
  }
}

// Trần mô tả sự cố, khớp maxLength của TextInput và bộ đếm ký tự.
const DESCRIPTION_LIMIT = 500;

const INCIDENT_CATEGORY_META: Record<
  IncidentCategory,
  { label: string; icon: ComponentProps<typeof MaterialIcons>["name"] }
> = {
  TRAFFIC_JAM: { label: "Kẹt xe", icon: "traffic" },
  VEHICLE_BREAKDOWN: { label: "Hỏng xe", icon: "build" },
  ACCIDENT: { label: "Tai nạn", icon: "warning" },
  WEATHER: { label: "Thời tiết", icon: "cloud" },
  OTHER: { label: "Khác", icon: "more-horiz" },
};

type ChatMessage = {
  id: string;
  speaker: "user" | "assistant";
  text: string;
  // ID message của trợ lý (từ event done) để gửi feedback; null với tin hệ thống.
  assistantMessageId?: string;
  // Rating đã gửi cho câu trả lời này (nếu có).
  feedback?: RagRating;
};

// v1 chưa có tọa độ stop từ API → điều hướng theo tên trạm đích.
function openDirectionsByName(destinationName: string) {
  const encoded = encodeURIComponent(destinationName);
  const url =
    Platform.OS === "android"
      ? `google.navigation:q=${encoded}`
      : Platform.OS === "ios"
        ? `http://maps.apple.com/?daddr=${encoded}&dirflg=d`
        : `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;

  void Linking.openURL(url);
}

export function DriverOverviewScreen() {
  const router = useRouter();
  const { displayName } = useAuthenticatedSession();
  const queryClient = useQueryClient();

  return (
    <OperationsScreen
      title="Lịch làm việc"
      subtitle={displayName}
      headerRight={
        <>
          <NotificationBell />
          <SettingsButton />
        </>
      }
      // Query lịch + danh sách shuttle nằm trong 2 section con → refetch qua
      // invalidate cả hai.
      onRefresh={() =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ["schedule"] }),
          queryClient.invalidateQueries({ queryKey: ["shuttle-trips"] }),
        ])
      }
    >
      <WorkScheduleSection onOpenActive={() => router.push("/driver/trip")} />
      <ShuttleScheduleSection />
    </OperationsScreen>
  );
}

export function AssistantOverviewScreen() {
  const router = useRouter();
  const { displayName } = useAuthenticatedSession();
  const queryClient = useQueryClient();

  return (
    <OperationsScreen
      title="Lịch làm việc"
      subtitle={displayName}
      headerRight={
        <>
          <NotificationBell />
          <SettingsButton />
        </>
      }
      onRefresh={() =>
        queryClient.invalidateQueries({ queryKey: ["schedule"] })
      }
    >
      <WorkScheduleSection
        onOpenActive={() => router.push("/assistant/boarding")}
      />
    </OperationsScreen>
  );
}

export function DriverTripScreen() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const activeTrip = useActiveTrip();
  const detailsQuery = useTripDetails(activeTrip.trip?.tripId ?? null);
  const details = detailsQuery.data;

  const statusMeta = tripStatusMeta(activeTrip.trip?.status);
  // Điểm dừng kế tiếp = stop PENDING đầu tiên theo thứ tự tuyến.
  // Dùng status thay vì so ETA với giờ hiện tại: xe chạy trễ thì ETA đã thành
  // quá khứ nhưng stop vẫn chưa tới, so theo giờ sẽ bỏ sót điểm đó.
  const nextStop = useMemo(
    () =>
      details?.stops
        .filter((stop) => stop.status === "PENDING")
        .sort((a, b) => a.orderIndex - b.orderIndex)[0],
    [details],
  );

  const tripId = activeTrip.trip?.tripId ?? null;
  // Chỉ phát GPS khi chuyến thực sự đang chạy/đón khách (foreground).
  const tripRunning = useMemo(() => {
    const status = normalizeTripStatus(activeTrip.trip?.status);
    return status === "IN_PROGRESS" || status === "BOARDING";
  }, [activeTrip.trip?.status]);
  // Chuyến đang mở soát vé (job backend tự chuyển SCHEDULED -> BOARDING
  // ~30 phút trước giờ chạy) — điều kiện để driver bấm "Bắt đầu chuyến".
  const tripBoarding =
    normalizeTripStatus(activeTrip.trip?.status) === "BOARDING";
  const startTripMutation = useStartTrip(tripId);
  // TRIP_INVALID_TRANSITION dùng chung mã với complete nhưng ngữ cảnh khác
  // (ở đây là "chưa BOARDING") → map riêng thay vì dùng message mặc định.
  const startError =
    startTripMutation.error instanceof ApiError &&
    startTripMutation.error.code === "TRIP_INVALID_TRANSITION"
      ? "Chuyến chưa mở soát vé nên chưa thể bắt đầu. Kéo xuống làm mới rồi thử lại."
      : tripOpsErrorMessage(startTripMutation.error);
  // Hoàn tất chuyến — chỉ khi đang IN_PROGRESS. TRIP_INVALID_TRANSITION của
  // complete đã có message đúng ngữ cảnh trong trip-ops-errors.
  const tripInProgress =
    normalizeTripStatus(activeTrip.trip?.status) === "IN_PROGRESS";
  const completeTripMutation = useCompleteTrip(tripId);
  const completeError = tripOpsErrorMessage(completeTripMutation.error);
  const routeQuery = useTripRouteGeometry(tripId);
  // Chỉ dùng khi bật cờ demo EXPO_PUBLIC_FAKE_GPS; bình thường là mảng rỗng.
  const simulationPath = useMemo(
    () => buildSimulationPath(routeQuery.data),
    [routeQuery.data],
  );
  const gps = useGpsBroadcast(
    tripId ? { kind: "trip", id: tripId } : null,
    tripRunning,
    simulationPath,
  );
  // ETA chỉ query khi tính năng tracking đã bật (production socket/REST sẵn sàng).
  const etaQuery = useTripEta(
    TRACKING_ENABLED ? tripId : null,
    nextStop?.stopId ?? null,
  );
  // Batch ETA của toàn bộ target còn lại (stops + bến đích). Socket
  // eta:batch:update là nguồn chính; REST /etas hydrate lần đầu + lưới an toàn.
  const etasQuery = useTripEtas(TRACKING_ENABLED ? tripId : null);
  const liveEtas = gps.etaBatch?.etas ?? etasQuery.data?.etas;
  const { byStopId: liveStopEtas, station: stationEta } = useMemo(
    () => splitEtaBatch(liveEtas),
    [liveEtas],
  );
  // Ưu tiên ETA server đẩy qua socket (server tự chọn stop kế theo guard của
  // nó); REST theo stop app đoán chỉ là dự phòng khi socket chưa có sự kiện.
  const eta = gps.eta ?? etaQuery.data?.eta ?? null;
  const gpsMeta = gpsStatusMeta(gps.status);

  // Banner booking mới chỉ hiện ~10s như toast rồi tự ẩn (dữ liệu ghế đã được
  // hook invalidate rồi, banner chỉ để báo). Đánh dấu eventId đã ẩn trong
  // callback setTimeout — không setState đồng bộ trong thân effect (rule
  // react-hooks/set-state-in-effect).
  const [hiddenBookingEventId, setHiddenBookingEventId] = useState<
    string | null
  >(null);
  useEffect(() => {
    const event = gps.bookingEvent;
    if (!event) {
      return;
    }
    const timer = setTimeout(() => setHiddenBookingEventId(event.eventId), 10_000);
    return () => clearTimeout(timer);
  }, [gps.bookingEvent]);
  const bookingBanner =
    gps.bookingEvent && gps.bookingEvent.eventId !== hiddenBookingEventId
      ? gps.bookingEvent
      : null;
  // Banner cho biến động booking khác (hủy/boarded/transfer) qua
  // booking:updated — cùng pattern tự ẩn sau 10s theo eventId.
  const [hiddenBookingUpdateId, setHiddenBookingUpdateId] = useState<
    string | null
  >(null);
  useEffect(() => {
    const event = gps.bookingUpdate;
    if (!event) {
      return;
    }
    const timer = setTimeout(
      () => setHiddenBookingUpdateId(event.eventId),
      10_000,
    );
    return () => clearTimeout(timer);
  }, [gps.bookingUpdate]);
  const bookingUpdateBanner =
    gps.bookingUpdate && gps.bookingUpdate.eventId !== hiddenBookingUpdateId
      ? bookingUpdateBannerText(gps.bookingUpdate)
      : null;
  // Banner trễ: ưu tiên contract mới delayStatus/delayMinutes từ gps.eta,
  // gps.delay (trip:statusChanged) là dự phòng. gps.delay=null (đã
  // DELAY_CLEARED) mà delayStatus không phải DELAYED thì không hiện banner.
  const delayStatus = gps.eta?.delayStatus;
  const isDelayed = delayStatus === "DELAYED" || Boolean(gps.delay);
  const delayMinutes = gps.eta?.delayMinutes ?? gps.delay?.delayMinutes ?? null;

  return (
    <OperationsScreen
      title="Chuyến đang chạy"
      subtitle={details?.originStation?.name ?? "Chuyến của bạn hôm nay"}
      headerRight={
        <>
          <NotificationBell />
          <SettingsButton />
        </>
      }
      onRefresh={() =>
        Promise.all([
          activeTrip.refetch(),
          ...(tripId ? [detailsQuery.refetch(), routeQuery.refetch()] : []),
          ...(TRACKING_ENABLED && tripId ? [etasQuery.refetch()] : []),
        ])
      }
    >
      {activeTrip.isLoading || (activeTrip.trip && detailsQuery.isLoading) ? (
        <LoadingCard label="Đang tải chuyến…" />
      ) : activeTrip.isError ? (
        <ErrorCard onRetry={() => void activeTrip.refetch()} />
      ) : !activeTrip.trip ? (
        <EmptyCard
          icon="event-busy"
          message="Hôm nay bạn không có chuyến nào đang chạy hoặc sắp khởi hành."
        />
      ) : detailsQuery.isError ? (
        <ErrorCard onRetry={() => void detailsQuery.refetch()} />
      ) : details ? (
        <>
          <SurfaceCard accent delay={0}>
            <RouteSummary
              originName={details.originStation?.name}
              destinationName={details.destinationStation?.name}
            />

            <View style={styles.metricRow}>
              <MetricTile
                icon="schedule"
                value={formatTimeHM(details.departureDateTime)}
                hint="Khởi hành"
                tone="primary"
                compact
              />
              <MetricTile
                icon="flag"
                value={formatTimeHM(details.estimatedArrivalTime)}
                hint="Đến nơi (dự kiến)"
                tone="info"
                compact
              />
            </View>

            <View style={styles.metricRow}>
              <MetricTile
                icon="event-seat"
                value={`${details.seatSummary.totalSeats - details.seatSummary.availableSeats}/${details.seatSummary.totalSeats}`}
                hint="Ghế đã đặt"
                tone="warning"
                compact
              />
              <MetricTile
                icon="timeline"
                value={statusMeta.label}
                hint="Trạng thái"
                tone={statusMeta.tone}
                compact
              />
            </View>

            {tripBoarding ? (
              <>
                <ActionButton
                  icon="play-arrow"
                  label={
                    startTripMutation.isPending
                      ? "Đang bắt đầu chuyến…"
                      : "Bắt đầu chuyến"
                  }
                  disabled={startTripMutation.isPending}
                  onPress={() => startTripMutation.mutate()}
                />
                <Text style={styles.metaText}>
                  Bấm khi xe rời bến — chuyến chuyển sang “Đang chạy”, mở khoá
                  xác nhận điểm dừng và phát hành trình.
                </Text>
              </>
            ) : null}
            {startError ? (
              <Text style={styles.delayText}>{startError}</Text>
            ) : null}

            {tripInProgress ? (
              <ActionButton
                icon="check-circle"
                label={
                  completeTripMutation.isPending
                    ? "Đang hoàn tất chuyến…"
                    : "Hoàn tất chuyến"
                }
                tone="secondary"
                disabled={completeTripMutation.isPending}
                onPress={() => {
                  // Chưa ghi nhận tới bến cuối thì hỏi lại cho chắc — backend
                  // không bắt buộc mốc này để complete, nhưng thường là bấm nhầm.
                  if (details.destinationArrivedAt == null) {
                    Alert.alert(
                      "Hoàn tất chuyến?",
                      "Chuyến chưa ghi nhận đã đến bến cuối. Vẫn hoàn tất?",
                      [
                        { text: "Chưa", style: "cancel" },
                        {
                          text: "Hoàn tất",
                          style: "destructive",
                          onPress: () => completeTripMutation.mutate(),
                        },
                      ],
                    );
                    return;
                  }
                  completeTripMutation.mutate();
                }}
              />
            ) : null}
            {completeError ? (
              <Text style={styles.delayText}>{completeError}</Text>
            ) : null}

            {details.destinationStation?.name ? (
              <ActionButton
                icon="directions"
                label={`Chỉ đường tới ${details.destinationStation.name}`}
                tone="primary"
                onPress={() =>
                  openDirectionsByName(details.destinationStation.name as string)
                }
              />
            ) : null}
          </SurfaceCard>

          <SurfaceCard delay={20}>
            <SectionTitle
              icon="map"
              title="Bản đồ tuyến"
              subtitle="Đường đi và các điểm dừng của chuyến."
            />
            {routeQuery.isLoading ? (
              <Text style={styles.metaText}>Đang tải bản đồ tuyến…</Text>
            ) : routeQuery.isError ? (
              <Text style={styles.metaText}>
                Không tải được tuyến. Kéo xuống để thử lại.
              </Text>
            ) : routeQuery.data ? (
              <TripRouteMap
                route={routeQuery.data}
                onPress={() => router.push("/route-map")}
              />
            ) : null}
          </SurfaceCard>

          <SurfaceCard delay={30}>
            <SectionTitle
              icon="alt-route"
              title="Đề xuất đổi tuyến"
              subtitle="Gặp sự cố dọc đường thì đề xuất tuyến thay thế cho điều hành duyệt."
            />
            <ActionButton
              icon="alt-route"
              label="Mở đề xuất đổi tuyến"
              tone="secondary"
              onPress={() => router.push("/route-proposals")}
            />
          </SurfaceCard>

          {TRACKING_ENABLED ? (
          <SurfaceCard delay={40}>
            <SectionTitle
              icon="my-location"
              title="Định vị hành trình"
              subtitle="Phát vị trí realtime cho hành khách theo dõi khi đang chạy."
            />
            <View style={styles.metricRow}>
              <MetricTile
                icon="gps-fixed"
                value={gpsMeta.label}
                hint="Phát vị trí"
                tone={gpsMeta.tone}
                compact
              />
              <MetricTile
                icon="navigation"
                value={eta ? `${eta.etaMinutes} phút` : "—"}
                hint="Đến điểm dừng kế"
                tone="primary"
                compact
              />
            </View>
            {stationEta ? (
              <Text style={styles.metaText}>
                Bến cuối: {liveEtaLine(stationEta)}.
              </Text>
            ) : null}
            {isDelayed ? (
              <Text style={styles.delayText}>
                {delayMinutes != null
                  ? `Chuyến đang trễ khoảng ${delayMinutes} phút so với lịch.`
                  : "Chuyến đang chạy trễ so với lịch."}
              </Text>
            ) : null}
            {gps.status === "denied" ? (
              <Text style={styles.metaText}>
                Chưa cấp quyền vị trí nên không thể phát hành trình. Vào Cài đặt để
                cấp quyền vị trí cho VietRide Driver.
              </Text>
            ) : null}
            {bookingBanner ? (
              <Text style={styles.metaText}>
                Có booking mới: {bookingBanner.bookingCode} ·{" "}
                {bookingBanner.passengerCount} khách. Danh sách ghế đã được
                làm mới.
              </Text>
            ) : null}
            {bookingUpdateBanner ? (
              <Text style={styles.metaText}>{bookingUpdateBanner}</Text>
            ) : null}
          </SurfaceCard>
          ) : null}

          <TripStopsCard
            details={details}
            nextStopId={nextStop?.stopId ?? null}
            liveEtas={liveStopEtas}
          />
        </>
      ) : null}
    </OperationsScreen>
  );
}

export function DriverIncidentScreen() {
  return (
    <IncidentReportScreen subtitle="Gửi sự cố, tai nạn về điều hành ngay trên xe." />
  );
}

export function AssistantIncidentScreen() {
  const router = useRouter();

  return (
    <IncidentReportScreen
      subtitle="Gửi sự cố, tai nạn về điều hành kèm vị trí và mô tả."
      onBack={() => router.back()}
    />
  );
}

function IncidentReportScreen({
  onBack,
  subtitle,
}: {
  onBack?: () => void;
  subtitle: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const activeTrip = useActiveTrip();
  const tripId = activeTrip.trip?.tripId ?? null;
  const details = useTripDetails(tripId).data;
  const incident = useReportIncident(tripId);

  // Không chọn sẵn loại nào: báo sự cố gửi thẳng cho điều hành và không rút lại
  // được, để mặc định "Kẹt xe" là chạm nhầm một cái bay đi một báo cáo sai.
  const [incidentCategory, setIncidentCategory] =
    useState<IncidentCategory | null>(null);
  const [incidentDescription, setIncidentDescription] = useState("");
  const [submitted, setSubmitted] = useState<ReportIncidentData | null>(null);
  const locationPermission = useLocationPermission();

  const errorMessage = tripOpsErrorMessage(incident.error);
  const tripRunning =
    normalizeTripStatus(activeTrip.trip?.status) === "IN_PROGRESS";

  // Lý do không gửi được, hiện NGAY TRÊN nút thay vì dưới (người dùng thấy nút
  // mờ trước, đọc lý do sau thì đã kịp bực).
  const blockedReason = !tripId
    ? "Chưa có chuyến nào đang chạy để báo sự cố."
    : !tripRunning
      ? "Chỉ báo được sự cố khi chuyến đang chạy."
      : !incidentCategory
        ? "Chọn loại sự cố trước khi gửi."
        : null;

  const send = async (category: IncidentCategory) => {
    // Rung xác nhận: tài xế đang trên xe rung xóc, phản hồi xúc giác đáng tin
    // hơn hiệu ứng thị giác. Lỗi haptics (máy tắt rung) không được chặn việc gửi.
    // Toạ độ là best-effort: không có quyền vị trí vẫn phải gửi được sự cố.
    const coords = await getCurrentCoords();
    const description = incidentDescription.trim();

    incident.mutate(
      {
        category,
        description: description.length > 0 ? description : null,
        ...(coords ?? {}),
      },
      {
        onSuccess: (data) => {
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
          setSubmitted(data);
          setIncidentDescription("");
          setIncidentCategory(null);
        },
        onError: () => {
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Error,
          );
        },
      },
    );
  };

  // Chốt lại trước khi gửi — thao tác một chiều, không có nút thu hồi.
  const confirmAndSend = () => {
    if (!tripId || !incidentCategory) {
      return;
    }

    const label = INCIDENT_CATEGORY_META[incidentCategory].label;
    Alert.alert(
      `Gửi báo cáo "${label}"?`,
      "Điều hành nhận được ngay và không thể thu hồi báo cáo.",
      [
        { text: "Xem lại", style: "cancel" },
        {
          text: "Gửi ngay",
          style: "destructive",
          onPress: () => void send(incidentCategory),
        },
      ],
    );
  };

  return (
    <OperationsScreen
      title="Báo sự cố"
      subtitle={subtitle}
      onBack={onBack}
      headerRight={
        <>
          <NotificationBell />
          <SettingsButton />
        </>
      }
    >
      <SurfaceCard accent delay={0}>
        <SectionTitle
          icon="location-on"
          title="Chuyến đang chạy"
          subtitle={
            details?.originStation?.name && details?.destinationStation?.name
              ? `${details.originStation.name} → ${details.destinationStation.name}`
              : "Chưa có chuyến đang chạy"
          }
        />
        <Text style={styles.metaText}>
          Điều hành nhận được ngay, chuyến không bị đổi trạng thái.
        </Text>

        {/* Nói thẳng báo cáo có kèm toạ độ hay không, chạm để cấp quyền — trước
            đây chưa cấp quyền thì âm thầm gửi thiếu vị trí. */}
        <Pressable
          accessibilityRole={
            locationPermission.granted ? "text" : "button"
          }
          disabled={locationPermission.granted !== false}
          onPress={() => void locationPermission.request()}
          style={styles.metaRow}
        >
          <MaterialIcons
            name={
              locationPermission.granted
                ? "my-location"
                : "location-disabled"
            }
            size={15}
            color={
              locationPermission.granted
                ? theme.tones.success.text
                : theme.tones.warning.text
            }
          />
          <Text style={styles.metaText}>
            {locationPermission.granted === null
              ? "Đang kiểm tra quyền vị trí…"
              : locationPermission.granted
                ? "Báo cáo sẽ đính kèm vị trí hiện tại."
                : locationPermission.requesting
                  ? "Đang xin quyền vị trí…"
                  : "Chưa cấp quyền vị trí — chạm để bật."}
          </Text>
        </Pressable>
      </SurfaceCard>

      {submitted ? (
        // Gửi xong thì thay hẳn form bằng thẻ xác nhận: banner nhỏ dưới đáy card
        // cũ dễ bị bỏ sót, tài xế không chắc đã gửi được hay chưa.
        <SurfaceCard delay={120}>
          <SectionTitle icon="check-circle" title="Đã gửi báo cáo" />
          <View style={styles.receiptRow}>
            <StatusChip
              label={INCIDENT_CATEGORY_META[submitted.category].label}
              tone="danger"
            />
            <StatusChip
              label={`Lúc ${formatTimeHM(submitted.reportedAt)}`}
              tone="neutral"
            />
            <StatusChip
              label={
                submitted.latitude != null && submitted.longitude != null
                  ? "Có vị trí"
                  : "Không có vị trí"
              }
              tone={
                submitted.latitude != null && submitted.longitude != null
                  ? "success"
                  : "warning"
              }
            />
          </View>
          <Text style={styles.metaText}>
            Mã sự cố: {submitted.incidentId.slice(0, 8)}… — điều hành đã nhận
            được, không cần gửi lại.
          </Text>
          <ActionButton
            icon="add"
            label="Gửi báo cáo khác"
            tone="secondary"
            onPress={() => setSubmitted(null)}
          />
        </SurfaceCard>
      ) : (
      <SurfaceCard delay={120}>
        <SectionTitle icon="warning-amber" title="Loại sự cố" />

        {/* Lưới 2 cột, ô cao 76px: tài xế bấm bằng ngón cái khi xe còn rung xóc,
            vùng chạm phải vượt 48dp theo chuẩn accessibility. */}
        <View style={styles.categoryWrap}>
          {INCIDENT_CATEGORIES.map((category) => {
            const selected = incidentCategory === category;
            const meta = INCIDENT_CATEGORY_META[category];

            return (
              <Pressable
                key={category}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={meta.label}
                onPress={() => {
                  void Haptics.selectionAsync();
                  // Chạm lại vào loại đang chọn thì bỏ chọn — sửa nhầm không cần
                  // thoát màn.
                  setIncidentCategory((current) =>
                    current === category ? null : category,
                  );
                }}
                style={({ pressed }) => [
                  styles.categoryTile,
                  selected && styles.categoryTileActive,
                  pressed && styles.categoryTilePressed,
                ]}
              >
                <MaterialIcons
                  name={meta.icon}
                  size={26}
                  color={selected ? theme.onAccent : theme.text}
                />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.categoryLabel,
                    selected && styles.categoryLabelActive,
                  ]}
                >
                  {meta.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <TextInput
          multiline
          numberOfLines={4}
          maxLength={DESCRIPTION_LIMIT}
          placeholder="Mô tả nhanh tình huống (không bắt buộc)."
          placeholderTextColor={theme.placeholder}
          style={styles.input}
          value={incidentDescription}
          onChangeText={setIncidentDescription}
        />

        {/* Bộ đếm ký tự: chạm trần thì bàn phím im lặng không nhận nữa, không có
            số đếm người dùng tưởng máy treo. */}
        <Text
          style={[
            styles.charCounter,
            incidentDescription.length >= DESCRIPTION_LIMIT * 0.9 &&
              styles.charCounterNearLimit,
          ]}
        >
          {incidentDescription.length}/{DESCRIPTION_LIMIT}
        </Text>

        {blockedReason ? (
          <Text style={styles.metaText}>{blockedReason}</Text>
        ) : null}

        <ActionButton
          icon="send"
          label={incident.isPending ? "Đang gửi…" : "Gửi báo cáo"}
          tone="danger"
          disabled={blockedReason != null || incident.isPending}
          onPress={confirmAndSend}
        />

        {errorMessage ? (
          <Text style={styles.errorText}>{errorMessage}</Text>
        ) : null}
      </SurfaceCard>
      )}
    </OperationsScreen>
  );
}

type ScanResult = { kind: "success" | "empty"; text: string };

export function AssistantBoardingScreen() {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const activeTrip = useActiveTrip();
  const tripId = activeTrip.trip?.tripId ?? null;
  const manifestQuery = useManifest(tripId);
  const seatMapQuery = useSeatMap(tripId);
  const qrScan = useQrScanMutation(tripId);
  const [codeDraft, setCodeDraft] = useState("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const items = useMemo(
    () => manifestQuery.data?.items ?? [],
    [manifestQuery.data],
  );
  const groups = useMemo(() => groupManifestByBooking(items), [items]);
  const boardedSeats = items.filter((item) =>
    isBoardedStatus(item.boardingStatus),
  ).length;
  const pendingSeats = items.length - boardedSeats;
  const pendingGroups = groups.filter((group) => !group.boarded);

  // Trạng thái từng ghế để tô sơ đồ (ghế không có trong manifest = trống).
  const seatStatusByNumber = useMemo(() => {
    const map = new Map<string, "boarded" | "pending">();
    items.forEach((item) => {
      map.set(
        item.seatNumber,
        isBoardedStatus(item.boardingStatus) ? "boarded" : "pending",
      );
    });
    return map;
  }, [items]);

  const handleCheckIn = (bookingCode: string) => {
    const code = bookingCode.trim();

    if (!code || qrScan.isPending) {
      return;
    }

    setScanResult(null);
    qrScan.mutate(code, {
      onSuccess: (data) => {
        const seats = data.items.map((item) => item.seatNumber).join(", ");
        setScanResult({
          kind: "success",
          text: `Đã xác nhận lên xe ${code.toUpperCase()} • ghế ${seats}.`,
        });
        setCodeDraft("");
      },
      onError: (error) => {
        setScanResult({
          kind: "empty",
          text:
            error instanceof ApiError
              ? error.message
              : "Không xác nhận được vé. Thử lại.",
        });
      },
    });
  };

  return (
    <OperationsScreen
      title="Đón khách lên xe"
      subtitle={
        activeTrip.trip
          ? `Khởi hành ${formatTimeHM(activeTrip.trip.departureDateTime)}`
          : "Chưa có chuyến hôm nay"
      }
      headerRight={
        <>
          <NotificationBell />
          <SettingsButton />
        </>
      }
      // Manifest đã có push/socket invalidate + poll 25s; kéo xuống để làm
      // mới ngay lập tức khi cần.
      onRefresh={() =>
        Promise.all([
          activeTrip.refetch(),
          ...(tripId ? [manifestQuery.refetch(), seatMapQuery.refetch()] : []),
        ])
      }
    >
      {activeTrip.isLoading ? (
        <LoadingCard label="Đang tải chuyến hôm nay…" />
      ) : activeTrip.isError ? (
        <ErrorCard onRetry={() => void activeTrip.refetch()} />
      ) : !activeTrip.trip ? (
        <EmptyCard
          icon="event-busy"
          message="Hôm nay bạn không có chuyến nào để đón khách."
        />
      ) : (
        <>
          <SurfaceCard accent delay={0}>
            <View style={styles.metricRowBoarding}>
              <MetricTile
                icon="directions-bus"
                value={String(boardedSeats)}
                hint="Đã lên"
                tone="success"
                compact
              />
              <MetricTile
                icon="schedule"
                value={String(pendingSeats)}
                hint="Chưa lên"
                tone={pendingSeats > 0 ? "warning" : "success"}
                compact
              />
              <MetricTile
                icon="confirmation-number"
                value={String(groups.length)}
                hint="Số vé"
                tone="info"
                compact
              />
            </View>
          </SurfaceCard>

          <SurfaceCard delay={90}>
            <SectionTitle
              icon="qr-code-scanner"
              title="Check-in bằng mã vé"
              subtitle="Quét QR trên vé của khách, hoặc nhập mã thủ công."
            />

            <ActionButton
              icon="qr-code-scanner"
              label={qrScan.isPending ? "Đang xử lý…" : "Quét QR bằng camera"}
              tone="primary"
              disabled={qrScan.isPending}
              onPress={() => setScannerOpen(true)}
            />

            <View style={styles.composerRow}>
              <TextInput
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="VD: BK9D2M"
                placeholderTextColor={theme.placeholder}
                style={styles.composerInput}
                value={codeDraft}
                onChangeText={setCodeDraft}
                onSubmitEditing={() => handleCheckIn(codeDraft)}
                returnKeyType="done"
              />
              <ActionButton
                label={qrScan.isPending ? "Đang xử lý…" : "Xác nhận"}
                tone="primary"
                small
                disabled={qrScan.isPending || codeDraft.trim().length === 0}
                onPress={() => handleCheckIn(codeDraft)}
              />
            </View>

            <QrScannerModal
              visible={scannerOpen}
              title="Quét vé của khách"
              hint="Đưa mã QR trên vé vào giữa khung."
              onScanned={(code) => {
                setScannerOpen(false);
                handleCheckIn(code);
              }}
              onClose={() => setScannerOpen(false)}
            />

            {scanResult ? (
              <View
                style={
                  scanResult.kind === "success"
                    ? styles.scanBanner
                    : styles.scanBannerNeutral
                }
              >
                <StatusChip
                  label={scanResult.kind === "success" ? "Đã lên xe" : "Lỗi"}
                  tone={scanResult.kind === "success" ? "success" : "warning"}
                />
                <Text style={styles.feedbackText}>{scanResult.text}</Text>
              </View>
            ) : null}
          </SurfaceCard>

          {manifestQuery.isLoading || seatMapQuery.isLoading ? (
            <LoadingCard label="Đang tải danh sách khách…" />
          ) : manifestQuery.isError ? (
            <ErrorCard onRetry={() => void manifestQuery.refetch()} />
          ) : (
            <>
              {seatMapQuery.data ? (
                <SurfaceCard delay={180}>
                  <SectionTitle icon="event-seat" title="Sơ đồ ghế" />
                  <ApiSeatGrid
                    seats={seatMapQuery.data.seats}
                    seatStatusByNumber={seatStatusByNumber}
                  />
                  <View style={styles.seatLegend}>
                    {(
                      [
                        { label: "Đã lên", style: styles.seatBoarded },
                        { label: "Chưa lên", style: styles.seatPending },
                        { label: "Trống", style: styles.seatEmpty },
                      ] as const
                    ).map((item) => (
                      <View key={item.label} style={styles.legendItem}>
                        <View style={[styles.legendDot, item.style]} />
                        <Text style={styles.legendText}>{item.label}</Text>
                      </View>
                    ))}
                  </View>
                </SurfaceCard>
              ) : null}

              <SurfaceCard delay={240}>
                <SectionTitle icon="how-to-reg" title="Vé chưa lên xe" />

                {pendingGroups.length === 0 ? (
                  <Text style={styles.metaText}>
                    Tất cả khách của chuyến đã lên xe.
                  </Text>
                ) : (
                  <View style={styles.listStack}>
                    {pendingGroups.map((group) => (
                      <View key={group.bookingCode} style={styles.pendingRow}>
                        <View style={styles.passengerHead}>
                          <Text style={styles.bookingCode}>
                            {group.bookingCode}
                          </Text>
                          <Text style={styles.metaText}>
                            Ghế {group.seats.join(", ")}
                          </Text>
                        </View>
                        <ActionButton
                          label="Xác nhận lên xe"
                          tone="primary"
                          small
                          disabled={qrScan.isPending}
                          onPress={() => handleCheckIn(group.bookingCode)}
                        />
                      </View>
                    ))}
                  </View>
                )}
              </SurfaceCard>
            </>
          )}
        </>
      )}
    </OperationsScreen>
  );
}

// Sơ đồ ghế từ API seat-map: dựng lưới theo row/col (deck 1 trước, deck 2 nếu có).
function ApiSeatGrid({
  seatStatusByNumber,
  seats,
}: {
  seatStatusByNumber: Map<string, "boarded" | "pending">;
  seats: SeatCell[];
}) {
  const styles = useThemedStyles(makeStyles);

  const decks = [...new Set(seats.map((seat) => seat.deck))].sort();

  return (
    <View style={styles.seatGrid}>
      {decks.map((deck) => {
        const deckSeats = seats.filter((seat) => seat.deck === deck);
        const rows = [...new Set(deckSeats.map((seat) => seat.row))].sort(
          (a, b) => a - b,
        );
        // Backend có xe đánh col từ 0, có xe từ 1 — vẽ từ minCol thực tế,
        // không hardcode từ 0 kẻo sinh "lối đi" ảo bên trái làm lưới lệch phải.
        const cols = deckSeats.map((seat) => seat.col);
        const maxCol = Math.max(...cols);
        const minCol = Math.min(...cols);

        return (
          <View key={`deck-${deck}`} style={styles.seatGrid}>
            {decks.length > 1 ? (
              <Text style={styles.metaText}>Tầng {deck}</Text>
            ) : null}
            {rows.map((row) => (
              <View key={`row-${deck}-${row}`} style={styles.seatRow}>
                {Array.from({ length: maxCol - minCol + 1 }, (_, index) => {
                  const col = minCol + index;
                  const seat = deckSeats.find(
                    (item) => item.row === row && item.col === col,
                  );

                  if (!seat || !seat.seatNumber) {
                    // Ô không có ghế = lối đi.
                    return (
                      <View
                        key={`aisle-${deck}-${row}-${col}`}
                        style={styles.seatAisle}
                      />
                    );
                  }

                  const boarding = seatStatusByNumber.get(seat.seatNumber);

                  return (
                    <View
                      key={seat.seatNumber}
                      style={[
                        styles.seatCell,
                        boarding == null && styles.seatEmpty,
                        boarding === "boarded" && styles.seatBoarded,
                        boarding === "pending" && styles.seatPending,
                      ]}
                    >
                      <Text style={styles.seatLabel}>{seat.seatNumber}</Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

export function AssistantCargoScreen() {
  const styles = useThemedStyles(makeStyles);
  const activeTrip = useActiveTrip();
  // Phụ xe có thể chạy nhiều ca/ngày, và kiện của ca sau phải được check-in
  // TRƯỚC giờ khởi hành (khi ca khác có thể đang active) → cho chọn chuyến
  // thay vì khóa cứng vào chuyến active. Mặc định vẫn là chuyến active.
  const today = isoDateOf(new Date());
  const scheduleQuery = useDriverSchedule(today, today);
  const todayTrips = scheduleQuery.data?.trips ?? [];
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const tripId =
    selectedTripId ??
    activeTrip.trip?.tripId ??
    todayTrips[0]?.tripId ??
    null;
  const parcelsQuery = useAssistantTripParcels(tripId);
  const items = parcelsQuery.data?.items ?? [];

  // Quét QR dán trên kiện → tra cứu nhanh kiện thuộc chuyến đang chọn.
  const scanParcel = useScanParcelQr(tripId);
  const [parcelScannerOpen, setParcelScannerOpen] = useState(false);
  const handleParcelScanned = (code: string) => {
    setParcelScannerOpen(false);
    scanParcel.mutate(code, {
      onSuccess: (data) => {
        const meta = parcelStatusMeta(data.status);
        Alert.alert(
          `Kiện ${data.parcelCode ?? code}`,
          [
            `Trạng thái: ${meta.label}`,
            `Người nhận: ${data.recipientName ?? "—"}`,
            `Kích cỡ: ${sizeCategoryLabel(data.sizeCategory)}`,
          ].join("\n"),
        );
      },
      onError: (error) => {
        Alert.alert(
          "Không tra cứu được kiện",
          tripOpsErrorMessage(error) ?? "Có lỗi xảy ra, thử lại sau.",
        );
      },
    });
  };

  // Đếm nhanh theo trạng thái cho phần tóm tắt.
  const loadedCount = items.filter((parcel) =>
    ["LOADED", "IN_TRANSIT"].includes(parcel.status),
  ).length;
  const toDeliverCount = items.filter((parcel) =>
    ["UNLOADED", "DELIVERED_PENDING_CONFIRM"].includes(parcel.status),
  ).length;

  return (
    <OperationsScreen
      title="Hàng ký gửi"
      subtitle="Nhận, dỡ và giao kiện hàng của chuyến."
      headerRight={
        <>
          <NotificationBell />
          <SettingsButton />
        </>
      }
      // Kiện có thể đổi trạng thái từ nơi khác (khách trả tiền, operator xử lý)
      // → kéo xuống để đồng bộ, tránh bấm nút trên trạng thái cũ dính 409.
      onRefresh={() =>
        Promise.all([
          activeTrip.refetch(),
          scheduleQuery.refetch(),
          ...(tripId ? [parcelsQuery.refetch()] : []),
        ])
      }
    >
      {activeTrip.isLoading || (tripId && parcelsQuery.isLoading) ? (
        <LoadingCard label="Đang tải kiện hàng…" />
      ) : activeTrip.isError ? (
        <ErrorCard onRetry={() => void activeTrip.refetch()} />
      ) : !tripId ? (
        <EmptyCard
          icon="event-busy"
          message="Chưa có chuyến đang chạy để xem kiện hàng."
        />
      ) : parcelsQuery.isError ? (
        <ErrorCard onRetry={() => void parcelsQuery.refetch()} />
      ) : (
        <>
          {todayTrips.length > 1 ? (
            <SurfaceCard delay={0}>
              <SectionTitle
                icon="alt-route"
                title="Chọn chuyến"
                subtitle="Kiện của ca sau cần nhận tại bến trước giờ chạy."
              />
              {/* Nhiều ca/ngày (có ngày 9+ ca) → chip cuộn ngang 1 dòng thay vì
                  xếp dọc chiếm cả màn hình. */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.segmentScrollRow}
              >
                {todayTrips.map((trip) => (
                  <ActionButton
                    key={trip.tripId}
                    label={`${formatTimeHM(trip.departureDateTime)} • ${tripStatusMeta(trip.status).label}`}
                    tone={trip.tripId === tripId ? "primary" : "secondary"}
                    small
                    onPress={() => setSelectedTripId(trip.tripId)}
                  />
                ))}
              </ScrollView>
            </SurfaceCard>
          ) : null}

          <SurfaceCard delay={60}>
            <SectionTitle
              icon="qr-code-scanner"
              title="Tra cứu kiện"
              subtitle="Quét mã QR dán trên kiện để xem nhanh trạng thái."
            />
            <ActionButton
              icon="qr-code-scanner"
              label={scanParcel.isPending ? "Đang tra cứu…" : "Quét QR kiện hàng"}
              tone="secondary"
              disabled={scanParcel.isPending}
              onPress={() => setParcelScannerOpen(true)}
            />
            <QrScannerModal
              visible={parcelScannerOpen}
              title="Quét QR kiện hàng"
              hint="Đưa mã QR dán trên kiện vào giữa khung."
              onScanned={handleParcelScanned}
              onClose={() => setParcelScannerOpen(false)}
            />
          </SurfaceCard>

          {items.length === 0 ? (
            <EmptyCard
              icon="inventory"
              message="Chuyến này chưa có kiện hàng nào."
            />
          ) : (
            <>
          <SurfaceCard accent delay={0}>
            <View style={styles.metricRow}>
              <MetricTile
                icon="inventory-2"
                value={String(items.length)}
                hint="Tổng kiện"
                tone="info"
                compact
              />
              <MetricTile
                icon="local-shipping"
                value={String(loadedCount)}
                hint="Trên xe"
                tone="success"
                compact
              />
              <MetricTile
                icon="file-download"
                value={String(toDeliverCount)}
                hint="Chờ giao"
                tone="warning"
                compact
              />
            </View>
          </SurfaceCard>

          <SurfaceCard delay={120}>
            <SectionTitle icon="inventory" title="Danh sách kiện" />
            <View style={styles.listStack}>
              {items.map((parcel) => (
                <ParcelCard
                  key={parcel.parcelId}
                  parcel={parcel}
                  tripId={tripId}
                />
              ))}
            </View>
          </SurfaceCard>
            </>
          )}
        </>
      )}
    </OperationsScreen>
  );
}

function ParcelCard({
  parcel,
  tripId,
}: {
  parcel: AssistantParcelItem;
  tripId: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const statusMeta = parcelStatusMeta(parcel.status);
  const actions = allowedParcelActions(parcel.status);

  const checkIn = useCheckInParcel(tripId);
  const reweigh = useReweighParcel(tripId);
  const load = useLoadParcel(tripId);
  const unload = useUnloadParcel(tripId);
  const deliver = useDeliverParcel(tripId);
  const confirmDelivery = useConfirmParcelDelivery(tripId);
  const confirmTransfer = useConfirmParcelTransfer(tripId);
  const resendEmail = useResendDeliveryEmail(tripId);

  // Panel đang mở: cân lại / xác nhận giao / không.
  const [mode, setMode] = useState<"none" | "reweigh" | "confirm">("none");
  const [len, setLen] = useState("");
  const [wid, setWid] = useState("");
  const [hei, setHei] = useState("");
  const [wgt, setWgt] = useState("");
  const [note, setNote] = useState("");

  // Ảnh bằng chứng (uri cục bộ, tối đa 3) đính kèm bước check-in/deliver.
  // Optional — không ảnh vẫn thao tác được. Chỉ ASSISTANT upload được
  // (Storage Rules), màn này vốn là màn assistant.
  const [evidenceUris, setEvidenceUris] = useState<string[]>([]);
  const [evidenceCameraOpen, setEvidenceCameraOpen] = useState(false);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  const dims = [len, wid, hei, wgt].map((value) =>
    Number(value.replace(",", ".")),
  );
  // Settlement v2: chỉ cần 4 số đo; backend tự suy size và tính giá cuối.
  const reweighValid = dims.every((n) => Number.isFinite(n) && n > 0);
  const busy =
    checkIn.isPending ||
    reweigh.isPending ||
    load.isPending ||
    unload.isPending ||
    deliver.isPending ||
    confirmDelivery.isPending ||
    confirmTransfer.isPending ||
    resendEmail.isPending;

  const errorMessage = firstErrorMessage(
    checkIn.error,
    reweigh.error,
    load.error,
    unload.error,
    deliver.error,
    confirmDelivery.error,
    confirmTransfer.error,
    resendEmail.error,
  );

  const submitReweigh = () => {
    const input: ReweighParcelInput = {
      actualLengthCm: dims[0],
      actualWidthCm: dims[1],
      actualHeightCm: dims[2],
      actualWeightKg: dims[3],
    };
    reweigh.mutate(
      { parcelId: parcel.parcelId, input },
      { onSuccess: () => setMode("none") },
    );
  };

  const submitConfirm = () => {
    confirmDelivery.mutate(
      { parcelId: parcel.parcelId, note: note.trim() },
      { onSuccess: () => setMode("none") },
    );
  };

  // Check-in/deliver kèm ảnh: upload trước (nếu có), lỗi upload thì dừng —
  // không gửi thao tác thiếu ảnh mà phụ xe tưởng đã đính kèm.
  const submitWithEvidence = (kind: "check-in" | "delivery") => {
    const run = async () => {
      let photoUrls: string[] | undefined;

      if (evidenceUris.length > 0) {
        setUploadingEvidence(true);
        try {
          photoUrls = await uploadEvidencePhotos(
            parcel.parcelId,
            kind,
            evidenceUris,
          );
        } catch (error) {
          Alert.alert(
            "Không upload được ảnh",
            error instanceof Error
              ? error.message
              : "Có lỗi xảy ra, thử lại sau.",
          );
          return;
        } finally {
          setUploadingEvidence(false);
        }
      }

      const clearPhotos = () => setEvidenceUris([]);
      if (kind === "check-in") {
        checkIn.mutate(
          {
            parcelId: parcel.parcelId,
            parcelCode: parcel.parcelCode,
            photoUrls,
          },
          { onSuccess: clearPhotos },
        );
      } else {
        deliver.mutate(
          { parcelId: parcel.parcelId, photoUrls },
          { onSuccess: clearPhotos },
        );
      }
    };

    void run();
  };

  return (
    <View style={styles.parcelCard}>
      <View style={styles.parcelHeader}>
        <View style={styles.parcelTitleStack}>
          <Text style={styles.parcelCode}>{parcel.parcelCode}</Text>
          <Text style={styles.parcelPeople}>
            {parcel.recipientName ?? "—"}
            {parcel.recipientPhone ? ` • ${parcel.recipientPhone}` : ""}
          </Text>
        </View>
        <StatusChip label={statusMeta.label} tone={statusMeta.tone} />
      </View>

      <View style={styles.metaStack}>
        <View style={styles.metaRow}>
          <MaterialIcons name="scale" size={15} color={theme.textSecondary} />
          <Text style={styles.metaText}>
            Kích cỡ{" "}
            {sizeCategoryLabel(
              parcel.actualSizeCategory ?? parcel.sizeCategory,
            )}
            {parcel.actualWeightKg != null
              ? ` • ${parcel.actualWeightKg}kg thực tế`
              : parcel.estimatedWeightKg != null
                ? ` • ~${parcel.estimatedWeightKg}kg`
                : ""}
          </Text>
        </View>
        {parcel.status === "PENDING_FINAL_PAYMENT" ? (
          <View style={styles.metaRow}>
            <MaterialIcons name="payments" size={15} color={theme.textSecondary} />
            <Text style={styles.metaText}>
              Khách còn thiếu{" "}
              {formatVnd(
                (parcel.balanceRequiredVnd ?? 0) - (parcel.balancePaidVnd ?? 0),
              )}
              {parcel.finalPaymentDeadline
                ? ` • hạn ${formatTimeHM(parcel.finalPaymentDeadline)}`
                : ""}
            </Text>
          </View>
        ) : null}
        {parcel.description ? (
          <View style={styles.metaRow}>
            <MaterialIcons
              name="description"
              size={15}
              color={theme.textSecondary}
            />
            <Text style={styles.metaText}>{parcel.description}</Text>
          </View>
        ) : null}
      </View>

      {errorMessage ? (
        <Text style={styles.parcelHint}>{errorMessage}</Text>
      ) : null}

      {mode === "reweigh" ? (
        <View style={styles.weighStack}>
          <View style={styles.dimRow}>
            <TextInput
              keyboardType="decimal-pad"
              placeholder="Dài (cm)"
              placeholderTextColor={theme.placeholder}
              style={styles.dimInput}
              value={len}
              onChangeText={setLen}
            />
            <TextInput
              keyboardType="decimal-pad"
              placeholder="Rộng (cm)"
              placeholderTextColor={theme.placeholder}
              style={styles.dimInput}
              value={wid}
              onChangeText={setWid}
            />
            <TextInput
              keyboardType="decimal-pad"
              placeholder="Cao (cm)"
              placeholderTextColor={theme.placeholder}
              style={styles.dimInput}
              value={hei}
              onChangeText={setHei}
            />
            <TextInput
              keyboardType="decimal-pad"
              placeholder="Nặng (kg)"
              placeholderTextColor={theme.placeholder}
              style={styles.dimInput}
              value={wgt}
              onChangeText={setWgt}
            />
          </View>

          <Text style={styles.parcelHint}>
            Hệ thống tự tính kích cỡ và giá cuối từ số đo; nếu khách còn thiếu
            tiền, khách sẽ thanh toán trên app của khách.
          </Text>

          <View style={styles.segmentRow}>
            <ActionButton
              label={reweigh.isPending ? "Đang gửi…" : "Xác nhận cân lại"}
              tone="primary"
              small
              disabled={busy || !reweighValid}
              onPress={submitReweigh}
            />
            <ActionButton
              label="Hủy"
              tone="ghost"
              small
              disabled={busy}
              onPress={() => setMode("none")}
            />
          </View>
        </View>
      ) : mode === "confirm" ? (
        <View style={styles.weighStack}>
          <TextInput
            placeholder="Ghi chú giao hàng (bắt buộc)"
            placeholderTextColor={theme.placeholder}
            style={styles.weighInput}
            value={note}
            onChangeText={setNote}
          />
          <View style={styles.segmentRow}>
            <ActionButton
              label={confirmDelivery.isPending ? "Đang gửi…" : "Xác nhận giao"}
              tone="primary"
              small
              disabled={busy || note.trim().length === 0}
              onPress={submitConfirm}
            />
            <ActionButton
              label="Hủy"
              tone="ghost"
              small
              disabled={busy}
              onPress={() => setMode("none")}
            />
          </View>
        </View>
      ) : (
        <View style={styles.parcelActionStack}>
          {actions.includes("check-in") || actions.includes("deliver") ? (
            <>
              <View style={styles.evidenceRow}>
                {evidenceUris.map((uri) => (
                  <Pressable
                    key={uri}
                    accessibilityRole="button"
                    onPress={() =>
                      setEvidenceUris((current) =>
                        current.filter((item) => item !== uri),
                      )
                    }
                  >
                    <Image source={{ uri }} style={styles.evidenceThumb} />
                  </Pressable>
                ))}
                <ActionButton
                  icon="photo-camera"
                  label={`Ảnh bằng chứng (${evidenceUris.length}/${MAX_EVIDENCE_PHOTOS})`}
                  tone="ghost"
                  small
                  disabled={
                    busy ||
                    uploadingEvidence ||
                    evidenceUris.length >= MAX_EVIDENCE_PHOTOS
                  }
                  onPress={() => setEvidenceCameraOpen(true)}
                />
              </View>
              {evidenceUris.length > 0 ? (
                <Text style={styles.parcelHint}>Chạm vào ảnh để xoá.</Text>
              ) : null}
              <EvidenceCameraModal
                visible={evidenceCameraOpen}
                title={`Chụp ảnh bằng chứng • ${parcel.parcelCode}`}
                onCaptured={(uri) => {
                  setEvidenceUris((current) => {
                    if (current.length >= MAX_EVIDENCE_PHOTOS) {
                      return current;
                    }
                    const next = [...current, uri];
                    if (next.length >= MAX_EVIDENCE_PHOTOS) {
                      setEvidenceCameraOpen(false);
                    }
                    return next;
                  });
                }}
                onClose={() => setEvidenceCameraOpen(false)}
              />
            </>
          ) : null}
          {actions.includes("check-in") ? (
            <ActionButton
              icon="how-to-reg"
              label={
                uploadingEvidence
                  ? "Đang tải ảnh…"
                  : checkIn.isPending
                    ? "Đang nhận…"
                    : "Nhận kiện tại bến"
              }
              tone="primary"
              small
              disabled={busy || uploadingEvidence}
              onPress={() => submitWithEvidence("check-in")}
            />
          ) : null}
          {actions.includes("load") ? (
            <ActionButton
              icon="file-upload"
              label={load.isPending ? "Đang xếp…" : "Xếp lên xe"}
              tone="primary"
              small
              disabled={busy}
              onPress={() =>
                load.mutate({
                  parcelId: parcel.parcelId,
                  parcelCode: parcel.parcelCode,
                })
              }
            />
          ) : null}
          {actions.includes("reweigh") ? (
            <ActionButton
              icon="scale"
              label="Cân lại"
              tone="secondary"
              small
              disabled={busy}
              onPress={() => setMode("reweigh")}
            />
          ) : null}
          {actions.includes("unload") ? (
            <ActionButton
              icon="file-download"
              label={unload.isPending ? "Đang dỡ…" : "Dỡ kiện"}
              tone="primary"
              small
              disabled={busy}
              onPress={() => unload.mutate(parcel.parcelId)}
            />
          ) : null}
          {actions.includes("deliver") ? (
            <ActionButton
              icon="local-shipping"
              label={
                uploadingEvidence
                  ? "Đang tải ảnh…"
                  : deliver.isPending
                    ? "Đang giao…"
                    : "Giao cho người nhận"
              }
              tone="primary"
              small
              disabled={busy || uploadingEvidence}
              onPress={() => submitWithEvidence("delivery")}
            />
          ) : null}
          {actions.includes("confirm-delivery") ? (
            <ActionButton
              icon="check-circle"
              label="Xác nhận giao"
              tone="primary"
              small
              disabled={busy}
              onPress={() => setMode("confirm")}
            />
          ) : null}
          {actions.includes("confirm-transfer") ? (
            <ActionButton
              icon="swap-horiz"
              label={
                confirmTransfer.isPending
                  ? "Đang xác nhận…"
                  : "Nhận kiện chuyển đến"
              }
              tone="primary"
              small
              disabled={busy}
              onPress={() =>
                confirmTransfer.mutate({
                  parcelId: parcel.parcelId,
                  parcelCode: parcel.parcelCode,
                })
              }
            />
          ) : null}
          {actions.includes("resend-email") ? (
            <ActionButton
              icon="mail"
              label={resendEmail.isPending ? "Đang gửi…" : "Gửi lại email"}
              tone="secondary"
              small
              disabled={busy}
              onPress={() =>
                resendEmail.mutate(parcel.parcelId, {
                  onSuccess: (data) => {
                    Alert.alert(
                      "Đã gửi lại email",
                      `Người nhận có thể xác nhận tới ${formatTimeHM(data.expiresAt)}.`,
                    );
                  },
                })
              }
            />
          ) : null}
          {actions.length === 0 ? (
            <Text style={styles.parcelHint}>
              Không có thao tác cho trạng thái hiện tại.
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

export function AssistantStopsScreen() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const activeTrip = useActiveTrip();
  const tripId = activeTrip.trip?.tripId ?? null;
  const detailsQuery = useTripDetails(tripId);
  const details = detailsQuery.data;

  const arriveStop = useArriveAtStop(tripId);
  const arriveDestination = useArriveAtDestination(tripId);

  const tripRunning =
    normalizeTripStatus(activeTrip.trip?.status) === "IN_PROGRESS";
  const busy = arriveStop.isPending || arriveDestination.isPending;
  const errorMessage = firstErrorMessage(
    arriveStop.error,
    arriveDestination.error,
  );

  const arrivedAtDestination = details?.destinationArrivedAt != null;

  // Điểm dừng kế tiếp = điểm đầu tiên còn PENDING. Điểm SKIPPED đã chốt nên
  // không phải là điểm kế tiếp.
  const nextStop = useMemo(() => {
    if (!details) {
      return null;
    }
    return (
      [...details.stops]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .find((stop) => stop.status === "PENDING") ?? null
    );
  }, [details]);

  const remainingStops = details
    ? details.stops.filter((stop) => stop.status === "PENDING").length
    : 0;

  // ETA realtime từ Tracking cache (REST /etas, refetch 60s). Màn assistant
  // không phát GPS/socket nên REST là nguồn duy nhất; rỗng thì dùng planned.
  const etasQuery = useTripEtas(TRACKING_ENABLED ? tripId : null);
  const { byStopId: liveStopEtas, station: stationEta } = useMemo(
    () => splitEtaBatch(etasQuery.data?.etas),
    [etasQuery.data?.etas],
  );
  const nextStopLiveEta = nextStop
    ? (liveStopEtas.get(nextStop.stopId) ?? null)
    : null;

  // Nhắc xác nhận khi server báo xe đã vào gần stop kế/bến cuối. Sticky theo
  // stopId: BE loại stop khỏi batch khi cách <50m nên không được tắt nhắc chỉ
  // vì stop biến mất khỏi batch — chỉ hết nhắc khi stop được chốt (đổi nextStop).
  // setState qua setTimeout trong callback để tuân rule set-state-in-effect.
  const [arrivalPromptStopId, setArrivalPromptStopId] = useState<string | null>(
    null,
  );
  const [destinationPromptShown, setDestinationPromptShown] = useState(false);
  useEffect(() => {
    if (
      !nextStop ||
      !nextStopLiveEta ||
      nextStopLiveEta.distanceMeters > ARRIVAL_PROMPT_DISTANCE_M ||
      arrivalPromptStopId === nextStop.stopId
    ) {
      return;
    }
    const stopId = nextStop.stopId;
    const timer = setTimeout(() => {
      setArrivalPromptStopId(stopId);
      // Rung nhẹ để phụ xe để ý dù đang nhìn chỗ khác trên màn hình.
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Warning,
      ).catch(() => undefined);
    }, 0);
    return () => clearTimeout(timer);
  }, [nextStop, nextStopLiveEta, arrivalPromptStopId]);
  useEffect(() => {
    if (
      destinationPromptShown ||
      !stationEta ||
      stationEta.distanceMeters > ARRIVAL_PROMPT_DISTANCE_M
    ) {
      return;
    }
    const timer = setTimeout(() => {
      setDestinationPromptShown(true);
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Warning,
      ).catch(() => undefined);
    }, 0);
    return () => clearTimeout(timer);
  }, [stationEta, destinationPromptShown]);
  // Chỉ nhắc khi stop đó vẫn đang là điểm kế tiếp (chốt xong thì tự hết).
  const showArrivalPrompt =
    tripRunning &&
    arrivalPromptStopId != null &&
    nextStop?.stopId === arrivalPromptStopId;
  const showDestinationPrompt =
    tripRunning && destinationPromptShown && !arrivedAtDestination;

  return (
    <OperationsScreen
      title="Điểm dừng và giờ đến"
      subtitle={details?.originStation?.name ?? "Chuyến của bạn hôm nay"}
      headerRight={
        <>
          <NotificationBell />
          <SettingsButton />
        </>
      }
      onRefresh={() =>
        Promise.all([
          activeTrip.refetch(),
          ...(tripId ? [detailsQuery.refetch()] : []),
          ...(TRACKING_ENABLED && tripId ? [etasQuery.refetch()] : []),
        ])
      }
    >
      {activeTrip.isLoading || (tripId && detailsQuery.isLoading) ? (
        <LoadingCard label="Đang tải điểm dừng…" />
      ) : !tripId ? (
        <EmptyCard message="Chưa có chuyến nào đang chạy." />
      ) : detailsQuery.isError ? (
        <ErrorCard
          message="Không tải được chi tiết chuyến."
          onRetry={() => void detailsQuery.refetch()}
        />
      ) : details ? (
        <>
          <SurfaceCard accent delay={0}>
            <RouteSummary
              originName={details.originStation?.name}
              destinationName={details.destinationStation?.name}
            />

            <View style={styles.metricRow}>
              <MetricTile
                icon="navigation"
                value={
                  nextStop ? `Điểm ${nextStop.orderIndex}` : "Hết điểm dừng"
                }
                hint={
                  nextStop
                    ? nextStopLiveEta
                      ? `Còn ${nextStopLiveEta.etaMinutes} phút`
                      : `Dự kiến ${formatTimeHM(nextStop.estimatedArrivalTime)}`
                    : "Còn bến cuối"
                }
                tone="primary"
                compact
              />
              <MetricTile
                icon="pin-drop"
                value={String(remainingStops)}
                hint="Điểm còn lại"
                tone={remainingStops > 0 ? "warning" : "success"}
                compact
              />
            </View>

            {showArrivalPrompt && nextStop ? (
              <Text style={styles.delayText}>
                Xe đã tới gần{" "}
                {nextStop.name || `Điểm ${nextStop.orderIndex}`} — bấm “Đã đến
                điểm này” để xác nhận nhé.
              </Text>
            ) : null}
          </SurfaceCard>

          <TripStopsCard
            details={details}
            nextStopId={nextStop?.stopId ?? null}
            liveEtas={liveStopEtas}
            attentionStopId={showArrivalPrompt ? arrivalPromptStopId : null}
            onArrive={(stopId) => arriveStop.mutate(stopId)}
            actionDisabled={!tripRunning || busy}
            pendingStopId={arriveStop.isPending ? arriveStop.variables : null}
          />

          <SurfaceCard delay={180}>
            <SectionTitle
              icon="flag"
              title="Bến cuối"
              subtitle="Xác nhận để mở khoá dỡ kiện trả tại bến"
            />

            {stationEta ? (
              <Text style={styles.metaText}>
                {liveEtaLine(stationEta)}.
              </Text>
            ) : null}

            {showDestinationPrompt ? (
              <Text style={styles.delayText}>
                Xe đã tới gần bến cuối — xác nhận khi xe vào bến nhé.
              </Text>
            ) : null}

            <Text style={styles.metaText}>
              Xác nhận tới bến KHÔNG kết thúc chuyến. Chuyến vẫn đang chạy cho
              tới khi tài xế bấm hoàn tất.
            </Text>

            <ActionButton
              icon="flag"
              label={
                arrivedAtDestination
                  ? "Đã ghi nhận tới bến cuối"
                  : arriveDestination.isPending
                    ? "Đang ghi nhận…"
                    : "Đã tới bến cuối"
              }
              tone={arrivedAtDestination ? "ghost" : "primary"}
              disabled={!tripRunning || busy || arrivedAtDestination}
              onPress={() => arriveDestination.mutate()}
            />

            {!tripRunning ? (
              <Text style={styles.metaText}>
                Chỉ ghi nhận được khi chuyến đang chạy.
              </Text>
            ) : null}

            {errorMessage ? (
              <Text style={styles.errorText}>{errorMessage}</Text>
            ) : null}
          </SurfaceCard>
        </>
      ) : null}

      {/* Chức năng unhappy-case (đường bị chặn) → đặt cuối trang, nhường vị trí
          đầu cho luồng chính là theo dõi điểm dừng/giờ đến. */}
      <SurfaceCard delay={240}>
        <SectionTitle
          icon="alt-route"
          title="Đề xuất đổi tuyến"
          subtitle="Đề xuất tuyến thay thế để điều hành duyệt khi đường bị chặn."
        />
        <ActionButton
          icon="alt-route"
          label="Mở đề xuất đổi tuyến"
          tone="secondary"
          onPress={() => router.push("/route-proposals")}
        />
      </SurfaceCard>
    </OperationsScreen>
  );
}

export function CrewSupportScreen() {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { role } = useAuthenticatedSession();
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const roleLabel = role === "ASSISTANT" ? "phụ xe" : "tài xế";
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "boot",
      speaker: "assistant",
      text: "Trợ lý đã sẵn sàng. Hãy hỏi về đón khách, sự cố, kiện hàng hoặc quy trình khi đổi tuyến.",
    },
  ]);

  const appendToMessage = (messageId: string, chunk: string) => {
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === messageId
          ? { ...message, text: message.text + chunk }
          : message,
      ),
    );
  };

  // Gửi câu hỏi lên RAG service, stream từng token vào bong bóng trả lời.
  const sendMessage = async (question: string) => {
    const trimmedQuestion = question.trim();

    if (!trimmedQuestion || streaming) {
      return;
    }

    const requestId = new Date().getTime();
    const answerId = `${requestId}-a`;
    setMessages((currentMessages) => [
      ...currentMessages,
      { id: `${requestId}-q`, speaker: "user", text: trimmedQuestion },
      { id: answerId, speaker: "assistant", text: "" },
    ]);
    setDraft("");
    setStreaming(true);

    try {
      await streamRagChat({
        message: trimmedQuestion,
        conversationId,
        onToken: (text) => appendToMessage(answerId, text),
        onDone: (payload) => {
          const nextId = payload?.conversationId;
          if (typeof nextId === "string") {
            setConversationId(nextId);
          }
          // Gắn assistantMessageId để bật nút đánh giá cho câu trả lời này.
          const assistantMessageId = payload?.assistantMessageId;
          if (typeof assistantMessageId === "string") {
            setMessages((currentMessages) =>
              currentMessages.map((message) =>
                message.id === answerId
                  ? { ...message, assistantMessageId }
                  : message,
              ),
            );
          }
        },
      });
    } catch (error) {
      const fallback =
        error instanceof ApiError
          ? error.message
          : "Trợ lý ảo đang gián đoạn, thử lại sau.";
      appendToMessage(answerId, fallback);
    } finally {
      setStreaming(false);
      // Nếu stream kết thúc mà không có token nào → báo không có trả lời.
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === answerId && message.text === ""
            ? { ...message, text: "Trợ lý chưa trả lời được câu này." }
            : message,
        ),
      );
    }
  };

  // Gửi đánh giá câu trả lời. Cập nhật lạc quan, revert nếu API lỗi.
  const sendFeedback = async (
    messageId: string,
    assistantMessageId: string,
    rating: RagRating,
  ) => {
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === messageId ? { ...message, feedback: rating } : message,
      ),
    );

    try {
      await sendRagFeedback(assistantMessageId, rating);
    } catch {
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === messageId
            ? { ...message, feedback: undefined }
            : message,
        ),
      );
    }
  };

  return (
    <OperationsScreen
      title="Hỗ trợ vận hành"
      subtitle={`Trợ giúp cho ${roleLabel}`}
      headerRight={
        <>
          <NotificationBell />
          <SettingsButton />
        </>
      }
    >
      <SurfaceCard accent delay={0}>
        <SectionTitle
          icon="support-agent"
          title="Trợ lý ảo"
          subtitle={`Đang hỗ trợ theo vai trò ${roleLabel}.`}
        />

        <Text style={styles.fieldLabel}>Câu hỏi nhanh</Text>
        <View style={styles.promptWrap}>
          {SUPPORT_QUICK_PROMPTS.map((prompt) => (
            <ActionButton
              key={prompt}
              label={prompt}
              tone="secondary"
              small
              disabled={streaming}
              onPress={() => void sendMessage(prompt)}
            />
          ))}
        </View>

        <View style={styles.chatStack}>
          {messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.messageBubble,
                message.speaker === "assistant"
                  ? styles.assistantBubble
                  : styles.userBubble,
              ]}
            >
              <View style={styles.messageSpeakerRow}>
                <MaterialIcons
                  name={
                    message.speaker === "assistant"
                      ? "support-agent"
                      : "person"
                  }
                  size={13}
                  color={theme.textSecondary}
                />
                <Text style={styles.messageSpeaker}>
                  {message.speaker === "assistant" ? "Trợ lý" : "Bạn"}
                </Text>
              </View>
              <Text style={styles.messageText}>{message.text}</Text>
              {message.speaker === "assistant" && message.assistantMessageId ? (
                <View style={styles.feedbackRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Câu trả lời hữu ích"
                    hitSlop={8}
                    onPress={() =>
                      void sendFeedback(
                        message.id,
                        message.assistantMessageId as string,
                        1,
                      )
                    }
                    style={styles.feedbackButton}
                  >
                    <MaterialIcons
                      name={
                        message.feedback === 1
                          ? "thumb-up"
                          : "thumb-up-off-alt"
                      }
                      size={16}
                      color={
                        message.feedback === 1
                          ? theme.primary
                          : theme.textSecondary
                      }
                    />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Câu trả lời chưa tốt"
                    hitSlop={8}
                    onPress={() =>
                      void sendFeedback(
                        message.id,
                        message.assistantMessageId as string,
                        -1,
                      )
                    }
                    style={styles.feedbackButton}
                  >
                    <MaterialIcons
                      name={
                        message.feedback === -1
                          ? "thumb-down"
                          : "thumb-down-off-alt"
                      }
                      size={16}
                      color={
                        message.feedback === -1
                          ? theme.danger
                          : theme.textSecondary
                      }
                    />
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}
        </View>

        <View style={styles.composerRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Nhập câu hỏi của bạn…"
            placeholderTextColor={theme.placeholder}
            style={styles.composerInput}
            onSubmitEditing={() => void sendMessage(draft)}
            returnKeyType="send"
          />
          <Pressable
            accessibilityRole="button"
            disabled={draft.trim().length === 0 || streaming}
            onPress={() => void sendMessage(draft)}
            style={({ pressed }) => [
              styles.sendButton,
              {
                opacity:
                  draft.trim().length === 0 || streaming
                    ? 0.4
                    : pressed
                      ? 0.88
                      : 1,
              },
            ]}
          >
            <MaterialIcons name="send" size={20} color={theme.onAccent} />
          </Pressable>
        </View>
      </SurfaceCard>
    </OperationsScreen>
  );
}

// Icon/màu cho từng tông thông báo — dùng chung cho chuông và màn Thông báo.
export const NOTIFICATION_ICON: Record<
  Tone,
  ComponentProps<typeof MaterialIcons>["name"]
> = {
  primary: "campaign",
  neutral: "notifications",
  success: "check-circle",
  warning: "schedule",
  danger: "error",
  info: "local-shipping",
};

export const NOTIFICATION_COLOR: Record<Tone, string> = {
  primary: "#2AC1BC",
  neutral: "#D3DBDF",
  success: "#00E676",
  warning: "#FFD600",
  danger: "#FF7C7C",
  info: "#35C2FF",
};

// Chuông thông báo gắn góc phải header; bấm mở màn Thông báo riêng.
// Badge đếm số thông báo CHƯA đọc.
export function NotificationBell() {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const router = useRouter();
  const unreadNotificationsCount = useUnreadNotificationsCount();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Thông báo điều hành"
      hitSlop={8}
      onPress={() => router.push("/notifications")}
      style={styles.bellButton}
    >
      <MaterialIcons name="notifications" size={22} color={theme.text} />
      {unreadNotificationsCount > 0 ? (
        <View style={styles.bellBadge}>
          <Text style={styles.bellBadgeText}>{unreadNotificationsCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// Bánh răng Cài đặt gắn góc phải header (đã bỏ khỏi bottom tabs cho đỡ chật).
// Đích đến phụ thuộc role vì màn Hỗ trợ/Sự cố dùng chung cho tài xế lẫn phụ xe.
export function SettingsButton() {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const router = useRouter();
  const { role } = useSession();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Cài đặt"
      hitSlop={8}
      onPress={() =>
        router.push(role === "DRIVER" ? "/driver/settings" : "/assistant/settings")
      }
      style={styles.bellButton}
    >
      <MaterialIcons name="settings" size={22} color={theme.text} />
    </Pressable>
  );
}

// Nhãn thứ trong tuần (tuần bắt đầu Thứ Hai để khớp lịch VN).
const WEEKDAY_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const WEEKDAY_FULL = [
  "Chủ nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
];

function isoOf(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateOf(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function startOfWeekMonday(date: Date): Date {
  const offset = (date.getDay() + 6) % 7; // 0 = Thứ Hai
  return addDays(date, -offset);
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

function WorkScheduleSection({
  onOpenActive,
}: {
  onOpenActive: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const today = useMemo(() => new Date(), []);
  const todayISO = isoOf(today);
  const [mode, setMode] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(today);
  const [selectedISO, setSelectedISO] = useState(todayISO);

  // Khoảng ngày đang hiển thị trên lịch → tham số from/to gọi API.
  const range = useMemo(() => {
    if (mode === "week") {
      const start = startOfWeekMonday(anchor);
      return { from: isoOf(start), to: isoOf(addDays(start, 6)) };
    }

    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { from: isoOf(monthStart), to: isoOf(monthEnd) };
  }, [mode, anchor]);

  const scheduleQuery = useDriverSchedule(range.from, range.to);
  const trips = useMemo(
    () => scheduleQuery.data?.trips ?? [],
    [scheduleQuery.data],
  );

  // Chi tiết các chuyến của ngày đang chọn (để hiện tên tuyến).
  const dayTrips = useMemo(
    () =>
      trips.filter(
        (trip) => isoDateOf(new Date(trip.departureDateTime)) === selectedISO,
      ),
    [trips, selectedISO],
  );
  const dayTripDetails = useTripDetailsMany(dayTrips.map((trip) => trip.tripId));

  const daysWithTrips = useMemo(
    () =>
      new Set(trips.map((trip) => isoDateOf(new Date(trip.departureDateTime)))),
    [trips],
  );

  // Map ScheduleTrip → ScheduleEntry để giữ nguyên phần render bên dưới.
  const dayEntries: ScheduleEntry[] = dayTrips.map((trip) => {
    const meta = tripStatusMeta(trip.status);
    const details = dayTripDetails.get(trip.tripId);
    const originName = details?.originStation?.name ?? null;
    const destinationName = details?.destinationStation?.name ?? null;
    const hasRoute = !!originName && !!destinationName;

    return {
      id: trip.tripId,
      date: isoDateOf(new Date(trip.departureDateTime)),
      originName: hasRoute ? originName : "Đang tải tuyến…",
      destinationName: hasRoute ? destinationName : "…",
      window: `${formatTimeHM(trip.departureDateTime)} – ${formatTimeHM(trip.estimatedArrivalTime)}`,
      vehicleLabel: `Vai trò: ${mapAssignmentRoleLabel(trip.assignmentRole)}`,
      statusLabel: meta.label,
      tone: meta.tone,
      kind:
        normalizeTripStatus(trip.status) === "IN_PROGRESS"
          ? "active"
          : normalizeTripStatus(trip.status) === "COMPLETED"
            ? "past"
            : "upcoming",
    };
  });

  const goPrev = () =>
    setAnchor((current) =>
      mode === "week"
        ? addDays(current, -7)
        : new Date(current.getFullYear(), current.getMonth() - 1, 1),
    );
  const goNext = () =>
    setAnchor((current) =>
      mode === "week"
        ? addDays(current, 7)
        : new Date(current.getFullYear(), current.getMonth() + 1, 1),
    );

  const renderDot = (iso: string, selected: boolean) => (
    <View
      style={[
        styles.dayDot,
        daysWithTrips.has(iso)
          ? selected
            ? styles.dayDotOnSelected
            : styles.dayDotActive
          : styles.dayDotHidden,
      ]}
    />
  );

  const weekDays = Array.from({ length: 7 }, (_, index) =>
    addDays(startOfWeekMonday(anchor), index),
  );

  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const leadingBlanks = (monthStart.getDay() + 6) % 7;
  const daysInMonth = new Date(
    anchor.getFullYear(),
    anchor.getMonth() + 1,
    0,
  ).getDate();
  const monthCells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  // Chèn ô trống ở cuối cho đủ bội số của 7 để tuần cuối không bị kéo giãn lệch cột.
  const trailingBlanks = (7 - (monthCells.length % 7)) % 7;
  monthCells.push(...Array.from({ length: trailingBlanks }, () => null));
  const monthWeeks = chunk(monthCells, 7);

  const selectedDate = dateOf(selectedISO);
  const dayTitle = `${WEEKDAY_FULL[selectedDate.getDay()]}, ${selectedDate.getDate()}/${selectedDate.getMonth() + 1}`;

  return (
    <>
      <SurfaceCard accent delay={0}>
        <View style={styles.calHeader}>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={goPrev}
            style={styles.calNavBtn}
          >
            <MaterialIcons name="chevron-left" size={22} color={theme.text} />
          </Pressable>
          <Text style={styles.calMonthLabel}>
            Tháng {anchor.getMonth() + 1}, {anchor.getFullYear()}
          </Text>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={goNext}
            style={styles.calNavBtn}
          >
            <MaterialIcons name="chevron-right" size={22} color={theme.text} />
          </Pressable>
        </View>

        <View style={styles.segment}>
          {(
            [
              { key: "week", label: "Tuần" },
              { key: "month", label: "Tháng" },
            ] as const
          ).map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              onPress={() => setMode(item.key)}
              style={[
                styles.segmentItem,
                mode === item.key && styles.segmentItemActive,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  mode === item.key && styles.segmentTextActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {mode === "week" ? (
          <View style={styles.weekRow}>
            {weekDays.map((day, index) => {
              const iso = isoOf(day);
              const selected = iso === selectedISO;
              const isToday = iso === todayISO;

              return (
                <Pressable
                  key={iso}
                  accessibilityRole="button"
                  onPress={() => setSelectedISO(iso)}
                  style={[styles.dayCell, selected && styles.dayCellSelected]}
                >
                  <Text
                    style={[
                      styles.dayWeekday,
                      selected && styles.dayTextSelected,
                    ]}
                  >
                    {WEEKDAY_SHORT[index]}
                  </Text>
                  <Text
                    style={[
                      styles.dayNumber,
                      selected && styles.dayTextSelected,
                      isToday && !selected && styles.dayNumberToday,
                    ]}
                  >
                    {day.getDate()}
                  </Text>
                  {renderDot(iso, selected)}
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.monthGrid}>
            <View style={styles.monthHeaderRow}>
              {WEEKDAY_SHORT.map((label) => (
                <Text key={label} style={styles.monthHeaderText}>
                  {label}
                </Text>
              ))}
            </View>
            {monthWeeks.map((week, weekIndex) => (
              <View key={`w-${weekIndex}`} style={styles.monthRow}>
                {week.map((day, dayIndex) => {
                  if (day == null) {
                    return (
                      <View
                        key={`b-${weekIndex}-${dayIndex}`}
                        style={styles.monthCell}
                      />
                    );
                  }

                  const iso = isoOf(
                    new Date(anchor.getFullYear(), anchor.getMonth(), day),
                  );
                  const selected = iso === selectedISO;
                  const isToday = iso === todayISO;

                  return (
                    <Pressable
                      key={iso}
                      accessibilityRole="button"
                      onPress={() => setSelectedISO(iso)}
                      style={styles.monthCell}
                    >
                      <View
                        style={[
                          styles.monthDay,
                          selected && styles.dayCellSelected,
                          isToday && !selected && styles.monthDayToday,
                        ]}
                      >
                        <Text
                          style={[
                            styles.monthDayText,
                            selected && styles.dayTextSelected,
                          ]}
                        >
                          {day}
                        </Text>
                      </View>
                      {renderDot(iso, selected)}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </SurfaceCard>

      {scheduleQuery.isLoading ? (
        <LoadingCard label="Đang tải lịch làm việc…" />
      ) : scheduleQuery.isError ? (
        <ErrorCard onRetry={() => void scheduleQuery.refetch()} />
      ) : (
        <SurfaceCard delay={90}>
          <View style={styles.scheduleHeaderRow}>
            <Text style={styles.scheduleDayTitle}>{dayTitle}</Text>
            <StatusChip
              label={`${dayEntries.length} ca`}
              tone={dayEntries.length > 0 ? "primary" : "neutral"}
            />
          </View>

          {dayEntries.length === 0 ? (
            <Text style={styles.metaText}>Không có ca chạy trong ngày này.</Text>
          ) : (
            <View style={styles.listStack}>
              {dayEntries.map((entry) => (
                <View key={entry.id} style={styles.scheduleEntry}>
                  <View style={styles.scheduleEntryHead}>
                    {/* Điểm đi ở dòng 1, mũi tên + điểm đến ở dòng 2 — vị trí mũi
                        tên cố định dù tên bến dài hay ngắn. */}
                    <View style={styles.scheduleRouteBlock}>
                      <Text style={styles.scheduleRoute}>
                        {entry.originName}
                      </Text>
                      <View style={styles.scheduleRouteLeg}>
                        <MaterialIcons
                          name="subdirectory-arrow-right"
                          size={16}
                          color={theme.textSecondary}
                          style={styles.scheduleRouteArrow}
                        />
                        <Text style={styles.scheduleRoute}>
                          {entry.destinationName}
                        </Text>
                      </View>
                    </View>
                    <StatusChip label={entry.statusLabel} tone={entry.tone} />
                  </View>
                  <View style={styles.metaRow}>
                    <MaterialIcons name="schedule" size={15} color={theme.textSecondary} />
                    <Text style={styles.metaText}>{entry.window}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <MaterialIcons
                      name="directions-bus"
                      size={15}
                      color={theme.textSecondary}
                    />
                    <Text style={styles.metaText}>{entry.vehicleLabel}</Text>
                  </View>
                  {entry.kind === "active" ? (
                    <ActionButton
                      label="Tiếp tục chuyến"
                      tone="primary"
                      small
                      onPress={onOpenActive}
                    />
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </SurfaceCard>
      )}
    </>
  );
}

// Tiến trình tuyến từ API. Hiển thị tên Stop canonical (stops[].name — BE mới
// đã trả); payload cũ chưa có tên thì fallback "Điểm dừng {orderIndex}".
// Dùng chung cho màn chuyến (chỉ xem) và màn điểm dừng (có thao tác).
// Truyền `onArrive` để bật nút xác nhận đã đến từng điểm.
// `liveEtas` là ETA realtime theo stopId từ batch /etas hoặc eta:batch:update;
// stop không có trong batch thì hiển thị planned ETA như cũ.
function TripStopsCard({
  details,
  nextStopId,
  liveEtas,
  attentionStopId = null,
  onArrive,
  actionDisabled = false,
  pendingStopId = null,
}: {
  details: TripDetails;
  nextStopId: string | null;
  liveEtas?: Map<string, TripTargetEta>;
  // Stop server báo xe đã tới gần → nhấn mạnh để crew bấm xác nhận.
  attentionStopId?: string | null;
  onArrive?: (stopId: string) => void;
  actionDisabled?: boolean;
  pendingStopId?: string | null;
}) {
  const styles = useThemedStyles(makeStyles);
  const stops = [...details.stops].sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <SurfaceCard delay={120}>
      <SectionTitle icon="route" title="Tiến trình tuyến" />

      <View style={styles.stopStack}>
        {stops.map((stop) => {
          const arrived = stop.status === "ARRIVED";
          const skipped = stop.status === "SKIPPED";
          // Điểm đã chốt (đến hoặc bỏ qua) thì không còn thao tác.
          const finalized = arrived || skipped;
          const isNext = stop.stopId === nextStopId;
          // ETA realtime chỉ áp dụng cho stop chưa chốt; stop đã đến/bỏ qua
          // hiển thị giờ thực tế hoặc planned như cũ.
          const liveEta = finalized ? null : liveEtas?.get(stop.stopId);

          return (
            <View key={stop.stopId} style={styles.stopRow}>
              <View style={styles.stopMarkerColumn}>
                <View
                  style={[
                    styles.stopMarker,
                    arrived && styles.stopMarkerCompleted,
                    isNext && styles.stopMarkerCurrent,
                  ]}
                />
                <View
                  style={arrived ? styles.stopLineActive : styles.stopLine}
                />
              </View>

              <View style={styles.stopContent}>
                <View style={styles.stopHeader}>
                  <View style={styles.stopNameBlock}>
                    <Text style={styles.stopTitle}>
                      {stop.name || `Điểm dừng ${stop.orderIndex}`}
                    </Text>
                    <Text style={styles.stopSubtitle}>
                      {[
                        stop.allowPickup ? "Đón khách" : null,
                        stop.allowDropoff ? "Trả khách" : null,
                      ]
                        .filter(Boolean)
                        .join(" • ") || "Chỉ dừng kỹ thuật"}
                    </Text>
                  </View>
                  <StatusChip
                    label={
                      arrived
                        ? "Đã đến"
                        : skipped
                          ? "Đã bỏ qua"
                          : isNext
                            ? "Kế tiếp"
                            : "Sắp tới"
                    }
                    tone={
                      arrived
                        ? "success"
                        : skipped
                          ? "neutral"
                          : isNext
                            ? "warning"
                            : "neutral"
                    }
                  />
                </View>
                <Text style={styles.stopMeta}>
                  {stop.actualArrivalTime
                    ? `Đến lúc ${formatTimeHM(stop.actualArrivalTime)}`
                    : liveEta
                      ? liveEtaLine(liveEta)
                      : `Dự kiến ${formatTimeHM(stop.estimatedArrivalTime)}`}
                  {stop.distanceFromOriginKm != null
                    ? ` • km ${stop.distanceFromOriginKm}`
                    : ""}
                </Text>

                {attentionStopId === stop.stopId && !finalized ? (
                  <Text style={styles.delayText}>
                    Xe đã ở gần điểm này — xác nhận nhé.
                  </Text>
                ) : null}

                {onArrive && !finalized ? (
                  <ActionButton
                    icon="check"
                    label={
                      pendingStopId === stop.stopId
                        ? "Đang ghi nhận…"
                        : "Đã đến điểm này"
                    }
                    tone="primary"
                    small
                    disabled={actionDisabled}
                    onPress={() => onArrive(stop.stopId)}
                  />
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </SurfaceCard>
  );
}


const makeStyles = (c: Palette) =>
  StyleSheet.create({
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  metricRow: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  routeSummary: {
    gap: 4,
  },
  routeEndpointRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  // Đường tuyến nối 2 bến, canh giữa theo icon 18px (center ≈ 9px → trái 8px).
  routeConnector: {
    width: 2,
    height: 14,
    borderRadius: 1,
    marginLeft: 8,
    backgroundColor: c.border,
  },
  routeEndpoint: {
    flex: 1,
    gap: 2,
  },
  routeEndpointLabel: {
    color: c.textSecondary,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  routeEndpointName: {
    color: c.text,
    fontFamily: Fonts.rounded,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: 700,
  },
  metricRowBoarding: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  calHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  calNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.tones.neutral.background,
    borderWidth: 1,
    borderColor: c.border,
  },
  calMonthLabel: {
    color: c.text,
    fontFamily: Fonts.rounded,
    fontSize: 18,
    fontWeight: 700,
  },
  segment: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: 14,
    backgroundColor: "rgba(148, 163, 174, 0.08)",
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
  },
  segmentItemActive: {
    backgroundColor: c.primary,
  },
  segmentText: {
    color: c.textMeta,
    fontSize: 14,
    fontWeight: 700,
  },
  segmentTextActive: {
    color: c.onAccent,
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dayCell: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 14,
  },
  dayCellSelected: {
    backgroundColor: c.primary,
  },
  dayWeekday: {
    color: c.textSecondary,
    fontSize: 12,
    fontWeight: 700,
  },
  dayNumber: {
    color: c.text,
    fontFamily: Fonts.rounded,
    fontSize: 16,
    fontWeight: 700,
  },
  dayNumberToday: {
    color: c.primary,
  },
  dayTextSelected: {
    color: c.onAccent,
  },
  dayDot: {
    // Android bo góc không chuẩn khi radius >> kích thước → đặt đúng nửa cạnh.
    width: 6,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  dayDotActive: {
    backgroundColor: c.primary,
  },
  dayDotOnSelected: {
    backgroundColor: c.onAccent,
  },
  dayDotHidden: {
    backgroundColor: "transparent",
  },
  monthGrid: {
    gap: 6,
  },
  monthHeaderRow: {
    flexDirection: "row",
  },
  monthHeaderText: {
    flex: 1,
    textAlign: "center",
    color: c.textSecondary,
    fontSize: 12,
    fontWeight: 700,
  },
  monthRow: {
    flexDirection: "row",
  },
  monthCell: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingVertical: 4,
  },
  monthDay: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  monthDayToday: {
    borderWidth: 1,
    borderColor: "rgba(2, 195, 154, 0.6)",
  },
  monthDayText: {
    color: c.text,
    fontSize: 14,
    fontWeight: 600,
  },
  scheduleHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  scheduleDayTitle: {
    color: c.text,
    fontFamily: Fonts.rounded,
    fontSize: 18,
    fontWeight: 700,
  },
  scheduleEntry: {
    borderRadius: 18,
    padding: Spacing.three,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    gap: 8,
  },
  scheduleEntryHead: {
    flexDirection: "row",
    // Chip trạng thái neo đỉnh để không nhảy khi tên bến xuống 2 dòng.
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  scheduleRouteBlock: {
    flex: 1,
    // minWidth 0: mặc định Yoga không cho flex item co dưới min-content, tên bến
    // dài sẽ đẩy chip trạng thái tràn ra ngoài card.
    minWidth: 0,
    gap: 2,
  },
  scheduleRouteLeg: {
    flexDirection: "row",
    alignItems: "flex-start",
    minWidth: 0,
    gap: 6,
  },
  scheduleRouteArrow: {
    // Căn theo baseline dòng chữ 16px thay vì giữa khối text nhiều dòng.
    marginTop: 3,
  },
  scheduleRoute: {
    flex: 1,
    color: c.text,
    fontFamily: Fonts.rounded,
    fontSize: 16,
    fontWeight: 700,
  },
  stopStack: {
    gap: Spacing.two,
  },
  stopRow: {
    flexDirection: "row",
    gap: Spacing.three,
  },
  stopMarkerColumn: {
    alignItems: "center",
    width: 18,
  },
  stopMarker: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: c.border,
    borderWidth: 2,
    borderColor: c.textSecondary,
    marginTop: 5,
  },
  stopMarkerCompleted: {
    backgroundColor: "#00E676",
    borderColor: "#00E676",
  },
  stopMarkerCurrent: {
    backgroundColor: "#FFD600",
    borderColor: "#FFD600",
  },
  stopLine: {
    flex: 1,
    width: 2,
    backgroundColor: "rgba(148, 163, 174, 0.15)",
    marginTop: Spacing.one,
  },
  stopLineActive: {
    flex: 1,
    width: 2,
    backgroundColor: "rgba(2, 195, 154, 0.3)",
    marginTop: Spacing.one,
  },
  stopContent: {
    flex: 1,
    gap: Spacing.one,
    paddingBottom: Spacing.three,
  },
  stopHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  stopNameBlock: {
    flex: 1,
    gap: 2,
  },
  stopTitle: {
    color: c.text,
    fontFamily: Fonts.rounded,
    fontSize: 17,
    fontWeight: 700,
  },
  stopSubtitle: {
    color: c.textSecondary,
    fontSize: 13,
  },
  stopMeta: {
    color: c.textGhost,
    fontSize: 14,
  },
  stopNote: {
    color: c.textSecondary,
    fontSize: 13,
  },
  categoryWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  categoryTile: {
    // "48%" + gap: đúng 2 cột, ô lẻ cuối cùng nằm một mình bên trái.
    width: "48%",
    height: 76,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: c.tones.neutral.background,
    borderWidth: 1,
    borderColor: c.border,
  },
  categoryTileActive: {
    backgroundColor: c.danger,
    borderColor: c.danger,
  },
  categoryTilePressed: {
    opacity: 0.7,
  },
  categoryLabel: {
    color: c.text,
    fontFamily: Fonts.rounded,
    fontSize: 13,
    fontWeight: 700,
  },
  categoryLabelActive: {
    color: c.onAccent,
  },
  charCounter: {
    alignSelf: "flex-end",
    color: c.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 12,
  },
  charCounterNearLimit: {
    color: c.tones.warning.text,
  },
  receiptRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  input: {
    minHeight: 116,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    color: c.text,
    textAlignVertical: "top",
    fontSize: 15,
    lineHeight: 22,
  },
  feedbackBanner: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 82, 82, 0.24)",
    backgroundColor: "rgba(255, 82, 82, 0.08)",
    padding: Spacing.three,
    gap: Spacing.two,
  },
  feedbackRow: {
    flexDirection: "row",
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  feedbackButton: {
    padding: Spacing.one,
  },
  feedbackText: {
    color: c.text,
    fontSize: 14,
    lineHeight: 21,
  },
  scanBanner: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(0, 230, 118, 0.24)",
    backgroundColor: "rgba(0, 230, 118, 0.08)",
    padding: Spacing.three,
    gap: Spacing.two,
  },
  scanBannerNeutral: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 214, 0, 0.24)",
    backgroundColor: "rgba(255, 214, 0, 0.08)",
    padding: Spacing.three,
    gap: Spacing.two,
  },
  listStack: {
    gap: Spacing.three,
  },
  passengerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.two,
    alignItems: "flex-start",
  },
  passengerHead: {
    flex: 1,
    gap: 4,
  },
  bookingCode: {
    color: c.primary,
    fontFamily: Fonts.mono,
    fontSize: 13,
  },
  passengerName: {
    color: c.text,
    fontFamily: Fonts.rounded,
    fontSize: 18,
    fontWeight: 700,
  },
  passengerMetaWrap: {
    gap: 4,
  },
  seatGrid: {
    gap: Spacing.two,
    alignItems: "center",
  },
  seatRow: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  seatCell: {
    width: 48,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surface,
    borderColor: c.border,
  },
  // Lối đi rộng bằng 1 ô ghế để mọi cột thẳng hàng (kể cả băng ghế cuối).
  seatAisle: {
    width: 48,
  },
  seatEmpty: {
    backgroundColor: "rgba(148, 163, 174, 0.06)",
    borderColor: "rgba(148, 163, 174, 0.18)",
  },
  seatBoarded: {
    backgroundColor: "rgba(0, 230, 118, 0.16)",
    borderColor: "rgba(0, 230, 118, 0.45)",
  },
  seatPending: {
    backgroundColor: "rgba(255, 214, 0, 0.16)",
    borderColor: "rgba(255, 214, 0, 0.45)",
  },
  seatPendingHere: {
    borderColor: "#FF5252",
    borderWidth: 2,
  },
  seatSelected: {
    borderColor: c.primary,
    borderWidth: 2,
  },
  seatLabel: {
    color: c.text,
    fontFamily: Fonts.mono,
    fontSize: 13,
    fontWeight: 700,
  },
  seatLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.three,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 16,
    height: 16,
    borderRadius: 6,
    borderWidth: 1,
  },
  legendText: {
    color: c.textMeta,
    fontSize: 13,
  },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
    borderRadius: 18,
    padding: Spacing.three,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  metaText: {
    color: c.textMeta,
    fontSize: 14,
    lineHeight: 20,
  },
  delayText: {
    color: c.warning,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  parcelCard: {
    borderRadius: 22,
    padding: Spacing.three,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    gap: Spacing.two,
  },
  parcelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.two,
    alignItems: "flex-start",
  },
  parcelTitleStack: {
    flex: 1,
    gap: 4,
  },
  parcelCode: {
    color: c.primary,
    fontFamily: Fonts.mono,
    fontSize: 13,
  },
  parcelPeople: {
    color: c.text,
    fontFamily: Fonts.rounded,
    fontSize: 17,
    fontWeight: 700,
  },
  metaStack: {
    gap: 6,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  weighStack: {
    gap: Spacing.two,
  },
  weighInput: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceDeep,
    paddingHorizontal: Spacing.three,
    color: c.text,
    fontSize: 15,
  },
  parcelActionStack: {
    gap: Spacing.one,
  },
  evidenceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: Spacing.one,
  },
  evidenceThumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
  },
  dimRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  dimInput: {
    flexGrow: 1,
    flexBasis: "47%",
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceDeep,
    paddingHorizontal: Spacing.three,
    color: c.text,
    fontSize: 15,
  },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  // Hàng chip chọn ca cuộn ngang — không wrap để giữ đúng 1 dòng.
  segmentScrollRow: {
    flexDirection: "row",
    gap: Spacing.two,
    paddingRight: Spacing.two,
  },
  parcelHint: {
    color: "#FFD600",
    fontSize: 13,
    lineHeight: 18,
  },
  errorText: {
    color: c.danger,
    fontSize: 13,
    lineHeight: 19,
  },
  fieldLabel: {
    color: c.textSecondary,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  promptWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  chatStack: {
    gap: Spacing.two,
  },
  messageSpeakerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  composerInput: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: c.border,
    // surface = trắng, trùng nền card ở light theme → ô nhập gần như tàng hình.
    backgroundColor: c.tones.neutral.background,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    color: c.text,
    fontSize: 15,
  },
  sendButton: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.primary,
  },
  messageBubble: {
    borderRadius: 22,
    padding: Spacing.three,
    gap: Spacing.one,
    maxWidth: "92%",
  },
  // Bong bóng trợ lý: nền trung tính nhạt. Trước dùng surfaceDeep (#D6DDDF ở
  // light) — xám xịt, nặng nề trên card trắng.
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: c.tones.neutral.background,
    borderWidth: 1,
    borderColor: c.tones.neutral.border,
    // Bo góc phía người nói nhỏ lại cho ra dáng bong bóng chat.
    borderBottomLeftRadius: 8,
  },
  // Bong bóng của mình: mint rõ (light #CFEDEB) / teal đậm (dark #113F3A) để
  // tách hẳn khỏi bên trợ lý, thay cho lớp phủ 16% quá nhạt.
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: c.primaryMuted,
    borderWidth: 1,
    borderColor: c.tones.primary.border,
    borderBottomRightRadius: 8,
  },
  messageSpeaker: {
    color: c.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 12,
  },
  messageText: {
    color: c.text,
    fontSize: 15,
    lineHeight: 22,
  },
  bellButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    // Dùng nền element (trắng ở light, xám đậm ở dark) thay cho xám mờ hardcode
    // — ở light theme màu cũ gần trùng nền nên gần như không thấy nút.
    backgroundColor: c.backgroundElement,
    borderWidth: 1,
    borderColor: c.border,
  },
  bellBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF5252",
    borderWidth: 2,
    borderColor: c.background,
  },
  bellBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: 700,
  },
});
