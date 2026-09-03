import { MaterialIcons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter, type Href } from "expo-router";
import {
    Fragment,
    useEffect,
    useMemo,
    useState,
    type ComponentProps,
} from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withTiming,
} from "react-native-reanimated";

import { ApiError } from "@/api/client";
import { manifestHasCustodyContract } from "@/api/parcel";
import type {
  ParcelCustodyLocationType,
  ParcelCustodyScanEvent,
  ParcelIncidentType,
  ParcelUnloadLocation,
  ReweighParcelInput,
} from "@/api/parcel";
import { sendRagFeedback, streamRagChat } from "@/api/rag";
import {
  INCIDENT_CATEGORIES,
  type ManifestItem,
  type AssistantParcelItem,
  type CustodyExceptionApproval,
  type ParcelLocationRef,
  type DestinationReconcileData,
  type StopReconcileData,
  type IncidentCategory,
  type BookingUpdatedEvent,
  type RagRating,
  type ReportIncidentData,
  type ScheduleTrip,
  type SeatCell,
  type SeatMapAisle,
  type TripDetails,
  type TripTargetEta,
} from "@/api/types";
import { EmptyCard, ErrorCard, LoadingCard } from "@/components/query-state";
import { Fonts, Spacing, type Palette } from "@/constants/theme";
import { QrScannerModal } from "@/features/boarding/qr-scanner";
import {
    groupManifestByBooking,
    isBoardedStatus,
    type BookingGroup,
    useBoardPassengers,
    useManifest,
    useQrScanMutation,
} from "@/features/boarding/use-boarding";
import {
    type ScheduleEntry,
    type Tone,
} from "@/features/operations/mock-data";
import { SUPPORT_QUICK_PROMPTS } from "@/features/operations/operations-context";
import { ragErrorMessage } from "@/features/operations/rag-errors";
import { useUnreadNotificationsCount } from "@/features/notifications/use-notifications";
import {
    WEEKDAY_FULL,
    WEEKDAY_SHORT,
    formatTimeHM,
    formatTripDayLabel,
    isoDateOf,
    mapAssignmentRoleLabel,
    normalizeTripStatus,
    tripStatusMeta,
} from "@/features/trips/trip-format";
import { useSelectedTrip } from "@/features/trips/selected-trip-context";
import { TripPicker } from "@/features/trips/trip-picker";
import {
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
  canConfirmTransferHere,
  custodyApprovalStatusLabel,
  custodyEventLabel,
  custodyLocationMismatch,
  destinationReconcileMeta,
  formatPhone,
  formatVnd,
  incidentStatusLabel,
  incidentTypeLabel,
  isIncomingTransfer,
  isParcelCode,
  locationLabel,
  locationPhrase,
  parcelStatusMeta,
  recommendedActionLabel,
  resolveParcelActions,
  sizeCategoryLabel,
  stopDepartureBlocked,
  trackingConfidenceMeta,
} from "@/features/parcels/parcel-format";
import { TripRouteMap } from "@/features/routes/trip-route-map";
import { useTripRouteGeometry } from "@/features/routes/use-route";
import { ShuttleScheduleSection } from "@/features/shuttle/shuttle-schedule-section";
import { EvidenceCameraModal } from "@/features/parcels/evidence-camera";
import { EvidencePicker } from "@/features/parcels/evidence-picker";
import {
  MAX_EVIDENCE_PHOTOS,
  uploadEvidencePhotos,
} from "@/features/parcels/evidence-upload";
import {
  useAssistantTripParcels,
  useCheckInParcel,
  useConfirmFoundOnVehicle,
  useConfirmParcelDelivery,
  useConfirmParcelTransfer,
  useCustodyException,
  useCustodyScan,
  useDeliverParcel,
  useLoadParcel,
  useReconcileDestination,
  useReconcileStop,
  useResendDeliveryEmail,
  useReweighParcel,
  useScanParcelQr,
  useUnloadParcel,
} from "@/features/parcels/use-parcels";
import {
  useAuthenticatedSession,
  useSession,
} from "@/features/session/session-context";
import { useDepartedStops } from "@/features/trip-ops/departed-stops";
import { tripCompletionBlocker } from "@/features/trip-ops/trip-completion";
import {
  firstErrorMessage,
  tripOpsErrorMessage,
} from "@/features/trip-ops/trip-ops-errors";
import {
  getCurrentCoords,
  useArriveAtDestination,
  useArriveAtStop,
  useDepartFromStop,
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
import { useCrewBookingEvents } from "@/features/tracking/use-crew-booking-events";
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

// Nhãn chất lượng ETA. TRAFFIC_AWARE là mức tốt nhất nên không cần chú thích.
// Giá trị lạ (enum mới của BE) rơi vào default → không chú thích gì, tuyệt đối
// không ẩn ETA hay crash.
function etaQualityNote(quality: string | undefined): string {
  switch (quality) {
    case "ROUTE_BASED":
      return " (ước tính theo tuyến đường)";
    case "FALLBACK":
      return " (ước tính)";
    default:
      return "";
  }
}

// Dòng mô tả ETA realtime: "Còn X phút • đến HH:MM", thêm chú thích chất lượng
// khi estimateQuality không phải TRAFFIC_AWARE (vẫn hợp lệ để hiển thị).
// Timestamp lấy nguyên từ server, KHÔNG tự cộng Date.now() + etaMinutes.
function liveEtaLine(eta: TripTargetEta): string {
  const base = `Còn ${eta.etaMinutes} phút • đến ${formatTimeHM(eta.estimatedArrivalTime)}`;
  return `${base}${etaQualityNote(eta.estimateQuality)}`;
}

// Câu thông báo cho banner booking:updated. BOOKING_CREATED trả null vì đã có
// banner riêng giàu thông tin hơn từ booking:created (legacy, BE vẫn giữ).
function bookingUpdateBannerText(event: BookingUpdatedEvent): string | null {
  switch (event.reason) {
    case "BOOKING_CANCELLED":
      return `Có vé vừa bị hủy${event.bookingCode ? ` (${event.bookingCode})` : ""}. Danh sách ghế đã được làm mới.`;
    case "PASSENGER_BOARDED":
      return "Có hành khách vừa được xác nhận lên xe.";
    case "BOOKING_TRANSFERRED":
      return "Có vé vừa được chuyển chuyến hoặc đổi ghế do đổi xe. Danh sách ghế đã được làm mới.";
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

// Ghép thông tin ca kế tiếp vào câu "chưa có chuyến".
//
// Cửa sổ vận hành chỉ tính hôm nay + rạng sáng mai, nên tuyến vừa được nhà xe
// giao cho ngày mai sẽ không có chip nào ở các màn này. Nếu chỉ nói "hôm nay
// không có chuyến" thì crew hiểu là app chưa nhận được phân công và đi
// logout/login — chính là cái hiểu sai cần chặn.
function withNextAssignedHint(
  message: string,
  nextAssignedTrip: ScheduleTrip | null,
): string {
  if (!nextAssignedTrip) {
    return message;
  }

  const day = formatTripDayLabel(nextAssignedTrip.departureDateTime);
  const time = formatTimeHM(nextAssignedTrip.departureDateTime);
  return `${message} Ca kế tiếp đã được giao: ${day} lúc ${time}.`;
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
  const activeTrip = useSelectedTrip();
  // live: poll 25s cho khớp nhịp manifest bên màn phụ xe — xem useTripDetails.
  const detailsQuery = useTripDetails(activeTrip.trip?.tripId ?? null, {
    live: true,
  });
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
  // 30 phút trước giờ chạy — BE xác nhận 2026-08-12) — điều kiện để driver
  // bấm "Bắt đầu chuyến".
  const tripBoarding =
    normalizeTripStatus(activeTrip.trip?.status) === "BOARDING";
  const startTripMutation = useStartTrip(tripId);
  // TRIP_INVALID_TRANSITION dùng chung mã với complete nhưng ngữ cảnh khác
  // (ở đây là "chưa BOARDING") → map riêng thay vì dùng message mặc định.
  const startError =
    startTripMutation.error instanceof ApiError &&
    startTripMutation.error.code === "TRIP_INVALID_TRANSITION"
      ? "Chuyến chưa mở soát vé nên chưa thể bắt đầu. Soát vé mở 30 phút trước giờ khởi hành — kéo xuống làm mới rồi thử lại."
      : tripOpsErrorMessage(startTripMutation.error);
  // Hoàn tất chuyến — chỉ khi đang IN_PROGRESS. TRIP_INVALID_TRANSITION của
  // complete đã có message đúng ngữ cảnh trong trip-ops-errors.
  const tripInProgress =
    normalizeTripStatus(activeTrip.trip?.status) === "IN_PROGRESS";
  const completeTripMutation = useCompleteTrip(tripId);
  const completeError = tripOpsErrorMessage(completeTripMutation.error);
  // FE-PCL-008: bước còn thiếu trước khi được phép đóng chuyến (null = đủ).
  const completionBlocker = tripCompletionBlocker({
    status: activeTrip.trip?.status,
    destinationArrivedAt: details?.destinationArrivedAt,
  });
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

  // useGpsBroadcast chỉ nối socket khi tripRunning, nên chuyến còn SCHEDULED thì
  // màn này không nhận booking:created/updated — ghế đổi mà không hay. Nối socket
  // crew listen-only cho quãng đó (hook này không xin quyền vị trí, không phát
  // GPS). Truyền null khi GPS đang bật để không mở socket thứ hai cùng một chuyến.
  const crewBooking = useCrewBookingEvents(tripRunning ? null : tripId);
  const bookingEvent = gps.bookingEvent ?? crewBooking.bookingEvent;
  const bookingUpdate = gps.bookingUpdate ?? crewBooking.bookingUpdate;

  // Banner booking mới chỉ hiện ~10s như toast rồi tự ẩn (dữ liệu ghế đã được
  // hook invalidate rồi, banner chỉ để báo). Đánh dấu eventId đã ẩn trong
  // callback setTimeout — không setState đồng bộ trong thân effect (rule
  // react-hooks/set-state-in-effect).
  const [hiddenBookingEventId, setHiddenBookingEventId] = useState<
    string | null
  >(null);
  useEffect(() => {
    const event = bookingEvent;
    if (!event) {
      return;
    }
    const timer = setTimeout(() => setHiddenBookingEventId(event.eventId), 10_000);
    return () => clearTimeout(timer);
  }, [bookingEvent]);
  const bookingBanner =
    bookingEvent && bookingEvent.eventId !== hiddenBookingEventId
      ? bookingEvent
      : null;
  // Banner cho biến động booking khác (hủy/boarded/transfer) qua
  // booking:updated — cùng pattern tự ẩn sau 10s theo eventId.
  const [hiddenBookingUpdateId, setHiddenBookingUpdateId] = useState<
    string | null
  >(null);
  useEffect(() => {
    const event = bookingUpdate;
    if (!event) {
      return;
    }
    const timer = setTimeout(
      () => setHiddenBookingUpdateId(event.eventId),
      10_000,
    );
    return () => clearTimeout(timer);
  }, [bookingUpdate]);
  const bookingUpdateBanner =
    bookingUpdate && bookingUpdate.eventId !== hiddenBookingUpdateId
      ? bookingUpdateBannerText(bookingUpdate)
      : null;
  // Banner trễ: ưu tiên contract mới delayStatus/delayMinutes từ gps.eta,
  // gps.delay (trip:statusChanged) là dự phòng. gps.delay=null (đã
  // DELAY_CLEARED) mà delayStatus không phải DELAYED thì không hiện banner.
  const delayStatus = gps.eta?.delayStatus;
  const isDelayed = delayStatus === "DELAYED" || Boolean(gps.delay);
  const delayMinutes = gps.eta?.delayMinutes ?? gps.delay?.delayMinutes ?? null;
  // Banner lệch tuyến: BE phát trip:routeDeviation khi xe rời polyline tuyến;
  // ROUTE_RESTORED thì hook đã tự trả null nên chỉ cần check khác null.
  const deviation = gps.deviation;

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
          message={withNextAssignedHint(
            "Hôm nay bạn không có chuyến nào đang chạy hoặc sắp khởi hành.",
            activeTrip.nextAssignedTrip,
          )}
        />
      ) : detailsQuery.isError ? (
        <ErrorCard onRetry={() => void detailsQuery.refetch()} />
      ) : details ? (
        <>
          <TripPicker subtitle="Chọn ca cần điều hành trong ngày." />

          <SurfaceCard accent delay={0}>
            {details.alternativeRouteId ? (
              <StatusChip label="Đang chạy tuyến thay thế" tone="warning" />
            ) : null}
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

            {/* Không kèm đoạn mô tả "bấm khi xe rời bến…": nhãn nút đã nói đủ,
                thêm chữ chỉ làm card dài ra và đẩy các nút khác xuống. */}
            {tripBoarding ? (
              <ActionButton
                icon="play-arrow"
                label={
                  startTripMutation.isPending
                    ? "Đang bắt đầu chuyến…"
                    : "Bắt đầu chuyến"
                }
                loading={startTripMutation.isPending}
                onPress={() => startTripMutation.mutate()}
              />
            ) : null}
            {startError ? (
              <Text style={styles.delayText}>{startError}</Text>
            ) : null}

            {tripInProgress ? (
              <>
                <ActionButton
                  icon="check-circle"
                  label={
                    completeTripMutation.isPending
                      ? "Đang hoàn tất chuyến…"
                      : "Hoàn tất chuyến"
                  }
                  tone="secondary"
                  loading={completeTripMutation.isPending}
                  // FE-PCL-008: thiếu bước nào thì khoá nút và nói rõ bước đó,
                  // KHÔNG hỏi "vẫn hoàn tất?" rồi cho bấm qua.
                  disabled={completionBlocker != null}
                  onPress={() => completeTripMutation.mutate()}
                />
                {completionBlocker ? (
                  <Text style={styles.metaText}>
                    {completionBlocker.reason}
                  </Text>
                ) : null}
              </>
            ) : null}
            {completeError ? (
              <Text style={styles.delayText}>{completeError}</Text>
            ) : null}

            {details.destinationStation?.name ? (
              <ActionButton
                icon="navigation"
                label={`Dẫn đường tới ${details.destinationStation.name}`}
                tone="primary"
                // Turn-by-turn giọng nói trong app (Mapbox Navigation): lộ
                // trình từ vị trí hiện tại → các điểm dừng chưa qua → bến
                // đích. Màn xem toàn tuyến vẫn mở được từ card Bản đồ tuyến.
                onPress={() => router.push("/turn-by-turn")}
              />
            ) : null}
          </SurfaceCard>

          <SurfaceCard delay={20}>
            {/* Bản đồ tự nói rõ nó là gì — bỏ subtitle mô tả lại tiêu đề. */}
            <SectionTitle icon="map" title="Bản đồ tuyến" />
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
            {deviation ? (
              <Text style={styles.delayText}>
                {deviation.distanceMeters != null
                  ? `Xe đang lệch lộ trình khoảng ${Math.round(deviation.distanceMeters)} m. Vui lòng quay lại tuyến.`
                  : "Xe đang lệch lộ trình. Vui lòng quay lại tuyến."}
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
                Có vé mới: {bookingBanner.bookingCode} ·{" "}
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
  const activeTrip = useSelectedTrip();
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

  // incident.isPending CHƯA phủ hết thời gian chờ: getCurrentCoords() lấy GPS
  // trước khi mutation bắt đầu và có thể mất vài giây, quãng đó nút vẫn sáng
  // như chưa bấm nên phụ xe bấm lại 2-3 lần → 2-3 báo cáo trùng lên điều hành.
  // sending bao trọn cả lấy toạ độ + gọi API, và là cờ khoá nút duy nhất.
  const [sending, setSending] = useState(false);

  const send = async (category: IncidentCategory) => {
    // Rung xác nhận: tài xế đang trên xe rung xóc, phản hồi xúc giác đáng tin
    // hơn hiệu ứng thị giác. Lỗi haptics (máy tắt rung) không được chặn việc gửi.
    // Toạ độ là best-effort: không có quyền vị trí vẫn phải gửi được sự cố.
    setSending(true);
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
          setSending(false);
          setSubmitted(data);
          setIncidentDescription("");
          setIncidentCategory(null);
        },
        onError: () => {
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Error,
          );
          setSending(false);
        },
      },
    );
  };

  // Chốt lại trước khi gửi — thao tác một chiều, không có nút thu hồi.
  const confirmAndSend = () => {
    // Chặn cả trường hợp bấm nhanh hai lần trước khi React kịp vẽ lại nút.
    if (!tripId || !incidentCategory || sending) {
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
          label={sending ? "Đang gửi báo cáo…" : "Gửi báo cáo"}
          tone="danger"
          loading={sending}
          disabled={blockedReason != null}
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
  const activeTrip = useSelectedTrip();
  const tripId = activeTrip.trip?.tripId ?? null;
  const manifestQuery = useManifest(tripId);
  const seatMapQuery = useSeatMap(tripId);
  const qrScan = useQrScanMutation(tripId);
  const boardSeats = useBoardPassengers(tripId);
  const [codeDraft, setCodeDraft] = useState("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  // Ghế vừa chạm trên sơ đồ → mở bảng trượt thông tin vé.
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null);

  // Socket crew room listen-only: phụ xe không có màn nào mount useGpsBroadcast
  // (hook đó chỉ ở màn Chuyến của driver) nên thiếu cái này thì màn Đón khách
  // chỉ còn poll 25s, không có realtime tức thì khi khách đặt/hủy vé.
  const booking = useCrewBookingEvents(tripId);
  // Banner tự ẩn sau 10s theo eventId — cùng pattern với DriverTripScreen
  // (data ghế đã được hook invalidate rồi, banner chỉ để báo).
  const [hiddenBookingEventId, setHiddenBookingEventId] = useState<
    string | null
  >(null);
  useEffect(() => {
    const event = booking.bookingEvent;
    if (!event) {
      return;
    }
    const timer = setTimeout(
      () => setHiddenBookingEventId(event.eventId),
      10_000,
    );
    return () => clearTimeout(timer);
  }, [booking.bookingEvent]);
  const bookingBanner =
    booking.bookingEvent &&
    booking.bookingEvent.eventId !== hiddenBookingEventId
      ? booking.bookingEvent
      : null;
  const [hiddenBookingUpdateId, setHiddenBookingUpdateId] = useState<
    string | null
  >(null);
  useEffect(() => {
    const event = booking.bookingUpdate;
    if (!event) {
      return;
    }
    const timer = setTimeout(
      () => setHiddenBookingUpdateId(event.eventId),
      10_000,
    );
    return () => clearTimeout(timer);
  }, [booking.bookingUpdate]);
  const bookingUpdateBanner =
    booking.bookingUpdate &&
    booking.bookingUpdate.eventId !== hiddenBookingUpdateId
      ? bookingUpdateBannerText(booking.bookingUpdate)
      : null;

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

  // TẠM (chẩn đoán 30/08): ghế nào kho ghế báo đã bán nhưng manifest không có
  // vé — trường hợp A10 sau khi đổi xe. In ra logcat để đối chiếu với BE.
  // XOÁ khi đã chốt nguyên nhân với backend.
  useEffect(() => {
    if (!__DEV__ || !seatMapQuery.data) {
      return;
    }
    const bookedSeats = seatMapQuery.data.seats
      .filter((seat) => seat.status?.toUpperCase() === "BOOKED")
      .map((seat) => seat.seatNumber);
    const manifestSeats = items.map((item) => item.seatNumber);
    const missing = bookedSeats.filter(
      (seat) => seat != null && !manifestSeats.includes(seat),
    );
    console.warn(
      `[seat-map] trip=${tripId} bán=${JSON.stringify(bookedSeats)} manifest=${JSON.stringify(manifestSeats)} thiếu-vé=${JSON.stringify(missing)}`,
    );
  }, [seatMapQuery.data, items, tripId]);

  // Xác nhận lên xe cho một booking bằng passengerRecordId có sẵn trong
  // manifest. Đây là đường đi ĐÚNG cho nút trên danh sách: qr-scan chỉ dùng khi
  // thật sự có mã quét được, còn validator `bookingCode` của backend đang từ
  // chối cả mã do chính nó sinh (BE-GAPS.md §5).
  const handleBoardGroup = (group: BookingGroup) => {
    if (boardSeats.isPending || group.pendingRecordIds.length === 0) {
      return;
    }

    setScanResult(null);
    boardSeats.mutate(group.pendingRecordIds, {
      onSuccess: () => {
        setScanResult({
          kind: "success",
          text: `Đã xác nhận lên xe ${group.bookingCode} • ghế ${group.seats.join(", ")}.`,
        });
      },
      onError: (error) => {
        setScanResult({
          kind: "empty",
          text:
            tripOpsErrorMessage(error) ??
            `Không xác nhận được ${group.bookingCode}. Thử lại.`,
        });
      },
    });
  };

  const handleCheckIn = (bookingCode: string) => {
    const code = bookingCode.trim();

    if (!code || qrScan.isPending) {
      return;
    }

    // Mã nhập tay/quét mà đã có trong manifest thì boarding trực tiếp — khỏi
    // đưa qua qr-scan rồi dính 422 vì format.
    const matched = groups.find(
      (group) =>
        group.bookingCode.toUpperCase() === code.toUpperCase() &&
        group.pendingRecordIds.length > 0,
    );
    if (matched) {
      setCodeDraft("");
      handleBoardGroup(matched);
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
          // Map mã lỗi sang tiếng Việt — message thô backend là tiếng Anh.
          text: tripOpsErrorMessage(error) ?? "Không xác nhận được vé. Thử lại.",
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
          message={withNextAssignedHint(
            "Hôm nay bạn không có chuyến nào để đón khách.",
            activeTrip.nextAssignedTrip,
          )}
        />
      ) : (
        <>
          <TripPicker subtitle="Chọn ca cần soát vé trong ngày." />

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
            {bookingBanner ? (
              <Text style={styles.metaText}>
                Có vé mới: {bookingBanner.bookingCode} ·{" "}
                {bookingBanner.passengerCount} khách. Danh sách ghế đã được
                làm mới.
              </Text>
            ) : null}
            {bookingUpdateBanner ? (
              <Text style={styles.metaText}>{bookingUpdateBanner}</Text>
            ) : null}
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
                    aisles={seatMapQuery.data.aisles}
                    seatStatusByNumber={seatStatusByNumber}
                    onSelectSeat={setSelectedSeat}
                  />
                  <View style={styles.seatLegend}>
                    {(
                      [
                        { label: "Đã lên", style: styles.seatBoarded },
                        { label: "Chưa lên", style: styles.seatPending },
                        { label: "Đã đặt (chưa có vé)", style: styles.seatBooked },
                        { label: "Trống", style: styles.seatEmpty },
                        { label: "Lối đi", style: styles.seatAisleLegend },
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
                          label={
                            boardSeats.isPending
                              ? "Đang xác nhận…"
                              : "Xác nhận lên xe"
                          }
                          tone="primary"
                          small
                          disabled={
                            boardSeats.isPending ||
                            group.pendingRecordIds.length === 0
                          }
                          onPress={() => handleBoardGroup(group)}
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

      {selectedSeat ? (
        <SeatInfoSheet
          seatNumber={selectedSeat}
          item={items.find((item) => item.seatNumber === selectedSeat) ?? null}
          boarding={boardSeats.isPending}
          onClose={() => setSelectedSeat(null)}
          onBoard={() => {
            const item = items.find(
              (entry) => entry.seatNumber === selectedSeat,
            );
            if (!item) {
              return;
            }
            // Soát đúng MỘT ghế đang chọn, không kéo cả booking lên — phụ xe
            // chạm ghế nào là xác nhận khách ngồi ghế đó.
            boardSeats.mutate([item.passengerRecordId], {
              onSuccess: () => setSelectedSeat(null),
            });
          }}
        />
      ) : null}
    </OperationsScreen>
  );
}

// Bảng trượt thông tin ghế vừa chạm trên sơ đồ. Đặt ở đây thay vì đẩy phụ xe
// xuống danh sách vé: nhìn sơ đồ thấy ghế chưa lên là soát ngay tại chỗ.
//
// LƯU Ý dữ liệu: manifest của backend KHÔNG trả tên và số điện thoại khách
// (xem docs/Implements/REQUEST-BE-BOARDING-MANIFEST-PASSENGER-INFO.md), nên bảng
// này mới chỉ hiện được mã vé / mã booking / điểm đón. Chỗ hiển thị tên đã chừa
// sẵn, BE bổ sung field là điền vào, không phải sửa lại giao diện.
function SeatInfoSheet({
  seatNumber,
  item,
  onBoard,
  boarding,
  onClose,
}: {
  seatNumber: string;
  item: ManifestItem | null;
  onBoard: () => void;
  boarding: boolean;
  onClose: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const boarded = item ? isBoardedStatus(item.boardingStatus) : false;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Chạm ra ngoài để đóng — thói quen quen thuộc của bảng trượt. */}
      <Pressable style={styles.sheetScrim} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Ghế {seatNumber}</Text>
          {item ? (
            <StatusChip
              label={boarded ? "Đã lên xe" : "Chưa lên xe"}
              tone={boarded ? "success" : "warning"}
            />
          ) : null}
        </View>

        {item ? (
          <View style={styles.metaStack}>
            <View style={styles.metaRow}>
              <MaterialIcons
                name="confirmation-number"
                size={15}
                color={theme.textSecondary}
              />
              <Text style={[styles.metaText, styles.metaTextGrow]}>
                Vé {item.ticketCode ?? item.bookingCode}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <MaterialIcons
                name="place"
                size={15}
                color={theme.textSecondary}
              />
              <Text style={[styles.metaText, styles.metaTextGrow]}>
                Đón tại {item.pickupStop ?? "bến đầu"}
              </Text>
            </View>
            {!boarded ? (
              <ActionButton
                icon="how-to-reg"
                label={boarding ? "Đang xác nhận…" : "Xác nhận lên xe"}
                tone="primary"
                disabled={boarding}
                onPress={onBoard}
              />
            ) : null}
          </View>
        ) : (
          // Ghế trống hoặc ghế đã bán mà chưa có vé trong manifest — nói rõ
          // thay vì mở bảng trống trơn.
          <Text style={styles.metaText}>
            Ghế này chưa có vé trong danh sách soát. Nếu sơ đồ đang tô “Đã đặt”
            thì khách mới giữ chỗ, chưa xuất vé — liên hệ điều hành nếu tới giờ
            chạy mà vẫn vậy.
          </Text>
        )}

        <ActionButton icon="close" label="Đóng" tone="ghost" onPress={onClose} />
      </View>
    </Modal>
  );
}

// Sơ đồ ghế từ API seat-map: dựng lưới theo row/col (deck 1 trước, deck 2 nếu có).
function ApiSeatGrid({
  seatStatusByNumber,
  seats,
  aisles,
  onSelectSeat,
}: {
  seatStatusByNumber: Map<string, "boarded" | "pending">;
  seats: SeatCell[];
  aisles: SeatMapAisle[];
  // Chạm vào ghế để mở thông tin vé — phụ xe nhìn sơ đồ thấy ghế chưa lên là
  // soát ngay tại chỗ, khỏi cuộn xuống danh sách mò đúng dòng.
  onSelectSeat?: (seatNumber: string) => void;
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
        const colCount = maxCol - minCol + 1;

        // Cột lối đi chèn SAU col nào — CHỈ theo dữ liệu BE (aisles.afterCol
        // từ layout snapshot của Trip, FE-RESPONSE-seat-map-aisle.md).
        // aisles=[] nghĩa là layout không có hành lang, không tự suy luận
        // (heuristic 2|2 cũ đã gỡ theo yêu cầu của doc). Cùng cấu hình aisle
        // áp cho mọi deck (contract v1); hỗ trợ nhiều aisle, không hard-code 1.
        const aisleAfterCols = new Set(aisles.map((aisle) => aisle.afterCol));

        return (
          <View key={`deck-${deck}`} style={styles.seatGrid}>
            {decks.length > 1 ? (
              <Text style={styles.metaText}>Tầng {deck}</Text>
            ) : null}
            {rows.map((row) => (
              <View key={`row-${deck}-${row}`} style={styles.seatRow}>
                {Array.from({ length: colCount }, (_, index) => {
                  const col = minCol + index;
                  const seat = deckSeats.find(
                    (item) => item.row === row && item.col === col,
                  );

                  // Hành lang chèn thêm sau cột này (từ aisles/heuristic) —
                  // là cột ảo nằm NGOÀI dải col của ghế nên vẽ bổ sung.
                  const walkway = aisleAfterCols.has(col) ? (
                    <View style={styles.seatAisle}>
                      <View style={styles.seatAisleStrip} />
                    </View>
                  ) : null;

                  // Lối đi: BE gửi tường minh (type AISLE / seatNumber null)
                  // hoặc ô khuyết trong lưới — đều vẽ dải hành lang cho dễ hình dung.
                  if (
                    !seat ||
                    !seat.seatNumber ||
                    seat.type?.toUpperCase() === "AISLE"
                  ) {
                    return (
                      <Fragment key={`aisle-${deck}-${row}-${col}`}>
                        <View style={styles.seatAisle}>
                          <View style={styles.seatAisleStrip} />
                        </View>
                        {walkway}
                      </Fragment>
                    );
                  }

                  // Nền là kho ghế của BE (seat.status), manifest phủ lên trên.
                  // Ghế đã bán nhưng chưa có dòng trong manifest (giữ chỗ/chưa
                  // xuất vé) từng bị tô "Trống" — đúng chỗ làm sơ đồ của phụ xe
                  // lệch với ô "Ghế đã đặt" của tài xế (lấy từ seatSummary, vốn
                  // đếm theo kho ghế). Giờ hiện "Đã đặt" để hai màn khớp nhau.
                  const boarding = seatStatusByNumber.get(seat.seatNumber);
                  const seatState =
                    boarding ??
                    (seat.status?.toUpperCase() === "BOOKED" ? "booked" : null);

                  return (
                    <Fragment key={seat.seatNumber}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Ghế ${seat.seatNumber}`}
                        // Ô không có số ghế (layout lỗi) thì chạm cũng không mở
                        // được gì — bỏ qua thay vì mở bảng trống.
                        onPress={() =>
                          seat.seatNumber
                            ? onSelectSeat?.(seat.seatNumber)
                            : undefined
                        }
                        style={[
                          styles.seatCell,
                          seatState == null && styles.seatEmpty,
                          seatState === "boarded" && styles.seatBoarded,
                          seatState === "pending" && styles.seatPending,
                          seatState === "booked" && styles.seatBooked,
                        ]}
                      >
                        <Text style={styles.seatLabel}>{seat.seatNumber}</Text>
                      </Pressable>
                      {walkway}
                    </Fragment>
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
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  // Phụ xe có thể chạy nhiều ca/ngày, và kiện của ca sau phải được check-in
  // TRƯỚC giờ khởi hành (khi ca khác có thể đang active) → chuyến thao tác lấy
  // từ bộ chọn dùng chung, không khóa cứng vào chuyến app tự đoán.
  const activeTrip = useSelectedTrip();
  const tripId = activeTrip.tripId;
  // Quét QR = LỌC danh sách xuống đúng kiện cầm trên tay, không phải mở popup
  // thông tin rồi thôi. Lọc bằng `search` của backend (không lọc tay trên trang
  // đang tải) để kiện nằm ở trang sau vẫn tìm ra.

  const parcelsQuery = useAssistantTripParcels(
    tripId,

  );
  const manifest = parcelsQuery.data;
  const items = useMemo(() => manifest?.items ?? [], [manifest]);
  // Backend đã bật contract custody v2 chưa (API-Parcel-Driver.md §1: production
  // còn manifest cũ). Chưa bật thì ẩn hẳn nhóm custody/đối soát thay vì gọi API
  // chưa deploy rồi bắt phụ xe đọc lỗi 404.
  const custodyV2 = manifestHasCustodyContract(manifest);

  // Vị trí vận hành hiện tại của xe — §7.4: chỉ được dỡ kiện khi xe ĐÃ tới
  // điểm đó và CHƯA rời đi. Đây là nguồn truth, không tự suy từ status chuyến.
  const operational = manifest?.tripContext?.currentOperationalLocation ?? null;
  const stoppedHere =
    operational?.status === "ARRIVED" && operational.departedAt == null;
  const currentStopId =
    stoppedHere && operational?.location?.type === "ROUTE_STOP"
      ? operational.location.id
      : null;
  // Xe đã tới BẾN CUỐI chưa — KHÔNG được suy từ `currentOperationalLocation`.
  // Guide (2) §C2 nói thẳng: "Do not use currentOperationalLocation for
  // destination-station unload", và §5 liệt kê "đã rời stop cuối" là một trong
  // các trường hợp `currentOperationalLocation = null` HỢP LỆ. Thực tế trên máy
  // 30/08: phụ xe đã bấm "Đã tới bến cuối" nhưng operational vẫn null nên nút
  // dỡ kiện bị khoá vĩnh viễn kèm câu "chưa phải chỗ xe đang dừng" — hàng về
  // tới bến mà không ai dỡ được.
  // Nguồn đúng là mốc `destinationArrivedAt` của trip detail.
  const tripDetails = useTripDetails(tripId);
  const atDestination =
    tripDetails.data?.destinationArrivedAt != null ||
    (stoppedHere && operational?.location?.type === "DESTINATION_STATION");

  // TẠM (chẩn đoán 30/08): vì sao nút dỡ kiện vẫn khoá dù đã bấm "Đã tới bến
  // cuối". In các đầu vào quyết định để soi trên logcat. XOÁ sau khi chốt.
  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    console.warn(
      `[unload-gate] trip=${tripId} destinationArrivedAt=${tripDetails.data?.destinationArrivedAt ?? "null"} operational=${operational?.location?.type ?? "null"}/${operational?.status ?? "null"} departedAt=${operational?.departedAt ?? "null"} atDestination=${atDestination} items=${JSON.stringify(
        items.map((p) => ({
          code: p.parcelCode,
          status: p.status,
          dropStop: p.dropoffStopId ?? null,
          dropType: p.dropoffLocation?.type ?? null,
          actions: p.availableActions ?? null,
        })),
      )}`,
    );
  }, [
    tripId,
    tripDetails.data,
    operational,
    atDestination,

    items,
  ]);
  const destinationStationId =
    manifest?.tripContext?.trip?.route?.destination?.id ??
    (atDestination ? (operational?.location?.id ?? null) : null);
  // Bến đầu của chuyến. Guide §2.2 + §7: bến đầu KHÔNG lấy từ
  // currentOperationalLocation (backend cố tình trả null khi chuyến chưa tới
  // route stop nào) mà lấy từ route.origin — đây là nguồn duy nhất để ghi nhận
  // custody tại bến đầu.
  const originLocation = manifest?.tripContext?.trip?.route?.origin ?? null;

  // Quét QR dán trên kiện = TRA CỨU rồi lọc card ra, đúng nhánh đầu tiên trong
  // decision tree của Playbook v2 §6 ("Chỉ muốn tìm Parcel từ QR? → qr-scan").
  // KHÔNG tự gọi custody-scan ở đây: §6 quy định custody-scan chỉ chạy khi
  // backend trả action `CUSTODY_SCAN` cho chính kiện đó, và phải nằm trong menu
  // phụ của card chứ không phải nút quét dùng chung đầu màn.
  const scanParcel = useScanParcelQr(tripId);
  const [parcelScannerOpen, setParcelScannerOpen] = useState(false);
  // Mã gõ tay khi tem QR không đọc được.
  const [codeDraft, setCodeDraft] = useState("");
  const handleParcelScanned = (raw: string) => {
    setParcelScannerOpen(false);
    const code = raw.trim();
    // Lọc sớm theo format chính thức (§6.2) — đỡ một vòng API và báo đúng bệnh
    // khi quét nhầm QR vé của khách.
    if (!isParcelCode(code)) {
      Alert.alert(
        "Không phải mã kiện hàng",
        code.startsWith("VT-")
          ? "Đây là mã vé của hành khách. Dùng nút quét ở màn Đón khách để soát vé."
          : "Mã vừa quét không đúng định dạng mã kiện (VR-PCL-…). Kiểm tra lại tem dán trên kiện.",
      );
      return;
    }
    // qr-scan để xác thực kiện có thuộc chuyến này không (404 = không thuộc)
    // và lấy parcelId — guide §A3: KHÔNG tự suy parcelId từ chuỗi QR.
    scanParcel.mutate(code, {
      // Quét/nhập xong là kiện đang ở trên tay → mở thẳng màn chi tiết của
      // kiện đó thay vì lọc danh sách rồi bắt phụ xe nhìn xuống tìm.
      onSuccess: (action) => {
        const state = action.parcelState;
        router.push(
          `/assistant/parcel?parcelId=${state.parcelId}&parcelCode=${encodeURIComponent(state.parcelCode ?? code)}` as Href,
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

  // Đổi xe do sự cố: manifest route crew trả kèm kiện đang ở xe CŨ chờ bốc
  // sang. Tách hẳn ra nhóm riêng để phụ xe không tưởng hàng đã trên xe mình.
  const incomingItems = items.filter(
    (parcel) =>
      isIncomingTransfer(parcel) && canConfirmTransferHere(parcel, tripId),
  );
  const onboardItems = items.filter(
    (parcel) => !incomingItems.includes(parcel),
  );

  // ===== Lọc + thu gọn danh sách =====
  // Chuyến chục kiện thì cuộn mãi không tới nơi. Lọc theo việc đang cần làm,
  // và danh sách chỉ hiện dạng gọn — chạm vào là sang màn chi tiết của kiện.
  const [listFilter, setListFilter] = useState<
    "all" | "todo" | "here" | "incident"
  >("all");

  // "Cần làm ngay" = có ít nhất một thao tác đổi trạng thái. Custody scan và
  // xem sự cố không tính, vì chúng không đẩy kiện đi tiếp trong vòng đời.
  const hasTodo = (parcel: AssistantParcelItem) =>
    resolveParcelActions(parcel).some((action) =>
      [
        "check-in",
        "reweigh",
        "load",
        "unload",
        "deliver",
        "confirm-delivery",
        "confirm-transfer",
        "confirm-found-on-vehicle",
      ].includes(action),
    );

  // "Trả tại điểm này" = điểm trả của kiện trùng chỗ xe đang dừng.
  const dropsHere = (parcel: AssistantParcelItem) => {
    const dropStopId = parcel.dropoffStopId ?? parcel.dropoffLocation?.id ?? null;
    if (currentStopId) {
      return dropStopId === currentStopId;
    }
    return (
      atDestination &&
      (parcel.dropoffStopId == null ||
        parcel.dropoffLocation?.type === "DESTINATION_STATION")
    );
  };

  // §11: số liệu lấy từ `summary` do backend đếm trên toàn chuyến. Contract cũ
  // không có summary thì mới tự đếm trên trang đang hiển thị.
  const summary = manifest?.summary ?? null;
  const totalCount = summary?.total ?? onboardItems.length;
  const loadedCount =
    summary?.loaded ??
    onboardItems.filter((parcel) =>
      ["LOADED", "IN_TRANSIT"].includes(parcel.status),
    ).length;
  const toDeliverCount =
    summary?.unloaded ??
    onboardItems.filter((parcel) =>
      ["UNLOADED", "DELIVERED_PENDING_CONFIRM"].includes(parcel.status),
    ).length;
  const exceptionCount =
    summary?.exceptionCount ??
    onboardItems.filter((parcel) => parcel.activeIncident != null).length;

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
          message={withNextAssignedHint(
            "Chưa có chuyến đang chạy để xem kiện hàng.",
            activeTrip.nextAssignedTrip,
          )}
        />
      ) : parcelsQuery.isError ? (
        <ErrorCard onRetry={() => void parcelsQuery.refetch()} />
      ) : (
        <>
          <TripPicker subtitle="Kiện của ca sau cần nhận tại bến trước giờ chạy." />


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
                value={String(totalCount)}
                hint="Tổng"
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
            {/* Sự cố là ngoại lệ: 0 thì không chiếm chỗ trong hàng metric (hàng
                này chỉ vừa 3 ô), có thì hiện thành dải cảnh báo cho nổi. */}
            {custodyV2 && exceptionCount > 0 ? (
              <View
                style={[
                  styles.exceptionBanner,
                  {
                    backgroundColor: theme.tones.danger.background,
                    borderColor: theme.tones.danger.border,
                  },
                ]}
              >
                <MaterialIcons
                  name="report-problem"
                  size={16}
                  color={theme.tones.danger.text}
                />
                <Text
                  style={[
                    styles.exceptionBannerText,
                    { color: theme.tones.danger.text },
                  ]}
                >
                  {exceptionCount} kiện đang có sự cố, chờ điều hành xử lý.
                </Text>
              </View>
            ) : null}
          </SurfaceCard>

          <SurfaceCard delay={60}>
            <SectionTitle
              icon="qr-code-scanner"
              title="Tìm kiện"
              subtitle="Quét mã QR dán trên kiện để lọc danh sách xuống đúng kiện đó."
            />
            <ActionButton
              icon="qr-code-scanner"
              label={scanParcel.isPending ? "Đang tra cứu…" : "Quét QR kiện hàng"}
              tone="secondary"
              disabled={scanParcel.isPending}
              onPress={() => setParcelScannerOpen(true)}
            />

            {/* Nhập tay như màn Đón khách: tem rách/mờ, camera bẩn, trời tối —
                vẫn tìm được kiện. CHỈ dùng để TRA CỨU; các bước dỡ kiện, nhận
                kiện chuyển đến và xác nhận kiện còn trên xe vẫn bắt quét QR
                thật vì đó là bằng chứng custody (Guide (2) §B3, §14). */}
            <View style={styles.composerRow}>
              <TextInput
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="Hoặc nhập mã: VR-PCL-…"
                placeholderTextColor={theme.placeholder}
                style={styles.composerInput}
                value={codeDraft}
                onChangeText={setCodeDraft}
                onSubmitEditing={() => {
                  handleParcelScanned(codeDraft);
                  setCodeDraft("");
                }}
                returnKeyType="search"
              />
              <ActionButton
                label={scanParcel.isPending ? "Đang tìm…" : "Tìm"}
                tone="primary"
                small
                disabled={scanParcel.isPending || codeDraft.trim().length === 0}
                onPress={() => {
                  handleParcelScanned(codeDraft);
                  setCodeDraft("");
                }}
              />
            </View>
            <QrScannerModal
              visible={parcelScannerOpen}
              title="Quét QR kiện hàng"
              hint="Đưa mã QR dán trên kiện vào giữa khung."
              onScanned={handleParcelScanned}
              onClose={() => setParcelScannerOpen(false)}
            />
          </SurfaceCard>

          {operational ? (
            <SurfaceCard delay={90}>
              <SectionTitle
                icon="place"
                title="Vị trí hiện tại của xe"
                subtitle={
                  stoppedHere
                    ? "Đang dừng tại đây — được phép dỡ kiện trả ở điểm này."
                    : "Xe chưa dừng ở điểm nào; chưa dỡ kiện được."
                }
              />
              <View style={styles.metaStack}>
                <View style={styles.metaRow}>
                  <StatusChip
                    label={locationLabel(operational.location)}
                    tone={stoppedHere ? "success" : "neutral"}
                  />
                  {operational.arrivedAt ? (
                    <Text style={[styles.metaText, styles.metaTextGrow]}>
                      Tới lúc {formatTimeHM(operational.arrivedAt)}
                    </Text>
                  ) : null}
                </View>
                {summary && summary.expectedAtCurrentStop > 0 ? (
                  <Text style={[styles.metaText, styles.metaTextGrow]}>
                    Cần trả tại điểm này: {summary.expectedAtCurrentStop} kiện.
                  </Text>
                ) : null}
              </View>
            </SurfaceCard>
          ) : null}

          {custodyV2 && tripId && currentStopId ? (
            <StopReconcileSection
              tripId={tripId}
              stopId={currentStopId}
              stopName={locationLabel(operational?.location)}
              // Kiện chờ nhận chưa thuộc chuyến này nên không tính vào đối soát
              // điểm dừng — đưa vào là báo thiếu oan.
              items={onboardItems}
            />
          ) : null}

          {/* Đối soát bến cuối — bước bắt buộc trước khi hoàn tất chuyến
              (Playbook v2 §10). Chỉ hiện khi xe đã tới bến cuối. */}
          {custodyV2 && tripId && atDestination ? (
            <DestinationReconcileSection tripId={tripId} />
          ) : null}

          {incomingItems.length > 0 ? (
            <SurfaceCard delay={105}>
              <SectionTitle
                icon="swap-horiz"
                title={`Hàng chờ nhận từ xe cũ (${incomingItems.length})`}
                subtitle="Bốc lên xe xong mới bấm xác nhận."
              />
              {/* Dải cảnh báo: nhóm này khác hẳn danh sách thường — hàng CHƯA
                  thuộc chuyến này, có hạn xác nhận 30 phút. Tô nổi để phụ xe
                  không lướt qua. */}
              <View
                style={[
                  styles.exceptionBanner,
                  {
                    backgroundColor: theme.tones.warning.background,
                    borderColor: theme.tones.warning.border,
                  },
                ]}
              >
                <MaterialIcons
                  name="swap-horiz"
                  size={16}
                  color={theme.tones.warning.text}
                />
                <Text
                  style={[
                    styles.exceptionBannerText,
                    { color: theme.tones.warning.text },
                  ]}
                >
                  Xe cũ gặp sự cố. Kiện chỉ thuộc chuyến này sau khi quét xác
                  nhận — quá 30 phút phải nhờ điều hành.
                </Text>
              </View>
              <View style={styles.listStack}>
                {incomingItems.map((parcel) => (
                  <ParcelCard
                    key={parcel.parcelId}
                    parcel={parcel}
                    tripId={tripId}
                    custodyV2={custodyV2}
                    currentStopId={currentStopId}
                    atDestination={Boolean(atDestination)}
                    destinationStationId={destinationStationId}
                    currentLocation={operational?.location ?? null}
                    originLocation={originLocation}
                  />
                ))}
              </View>
            </SurfaceCard>
          ) : null}

          <SurfaceCard delay={120}>
            <SectionTitle icon="inventory" title="Danh sách kiện" />
            {/* Bộ lọc: chỉ hiện khi danh sách đủ dài để cần lọc. */}
            {onboardItems.length > 4 ? (
              <View style={styles.filterRow}>
                {(
                  [
                    ["all", "Tất cả", onboardItems.length],
                    ["todo", "Cần làm ngay", onboardItems.filter(hasTodo).length],
                    ["here", "Trả tại điểm này", onboardItems.filter(dropsHere).length],
                    [
                      "incident",
                      "Có sự cố",
                      onboardItems.filter((p) => p.activeIncident != null).length,
                    ],
                  ] as const
                ).map(([key, label, count]) => (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    onPress={() => setListFilter(key)}
                    style={[
                      styles.filterChip,
                      listFilter === key && styles.filterChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        listFilter === key && styles.filterChipTextActive,
                      ]}
                    >
                      {label} {count}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {onboardItems.length === 0 ? (
              <Text style={styles.parcelHint}>
                Chuyến này chưa có kiện nào trên xe. Hàng chờ nhận từ xe cũ nằm
                ở mục phía trên.
              </Text>
            ) : null}
            <View style={styles.listStack}>
              {onboardItems
                .filter((parcel) =>
                  listFilter === "todo"
                    ? hasTodo(parcel)
                    : listFilter === "here"
                      ? dropsHere(parcel)
                      : listFilter === "incident"
                        ? parcel.activeIncident != null
                        : true,
                )
                .map((parcel) => (
                  <ParcelCard
                    key={parcel.parcelId}
                    parcel={parcel}
                    tripId={tripId}
                    custodyV2={custodyV2}
                    currentStopId={currentStopId}
                    atDestination={Boolean(atDestination)}
                    destinationStationId={destinationStationId}
                    currentLocation={operational?.location ?? null}
                    originLocation={originLocation}
                    // Danh sách chỉ để duyệt/tìm: luôn ở dạng gọn, chạm vào là
                    // sang màn chi tiết — nơi có đủ thông tin và nút thao tác.
                    expanded={false}
                    onToggleExpand={() =>
                      router.push(
                        `/assistant/parcel?parcelId=${parcel.parcelId}&parcelCode=${encodeURIComponent(parcel.parcelCode)}` as Href,
                      )
                    }
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

// Đối soát kiện tại BẾN CUỐI trước khi hoàn tất chuyến (Playbook v2 §10).
// Không gửi body — backend tự đối chiếu custody. Còn kiện chưa xử lý thì backend
// mở UNSCANNED_HANDOFF/SEARCHING và chỉ TÀI XẾ mới được hoàn tất chuyến.
function DestinationReconcileSection({ tripId }: { tripId: string }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const reconcile = useReconcileDestination(tripId);
  const [result, setResult] = useState<DestinationReconcileData | null>(null);
  const unresolved = result?.unresolvedParcels ?? [];
  const errorMessage = tripOpsErrorMessage(reconcile.error);
  // FE-PCL-004: nhãn lấy từ số đếm / cờ `allDelivered`, KHÔNG lấy từ
  // `canComplete` — cờ đó chỉ nói "được phép đóng chuyến".
  const meta = result
    ? destinationReconcileMeta({
        expectedCount: result.expectedCount,
        scannedCount: result.scannedCount,
        canComplete: result.canComplete,
        unresolvedCount: unresolved.length,
        allDelivered: result.allDelivered,
      })
    : null;

  return (
    <SurfaceCard delay={110}>
      <SectionTitle
        icon="fact-check"
        title="Đối soát tại bến cuối"
        subtitle="Kiểm lại xem còn sót kiện nào chưa giao không."
      />
      <View style={styles.metaStack}>
        {errorMessage ? (
          <Text style={styles.errorText}>{errorMessage}</Text>
        ) : null}

        {result && meta ? (
          <>
            <View style={styles.metaRow}>
              <StatusChip label={meta.label} tone={meta.tone} />
              <Text style={[styles.metaText, styles.metaTextGrow]}>
                Đã giao {result.scannedCount}/{result.expectedCount} kiện
              </Text>
            </View>
            {meta.hint ? (
              <Text style={styles.parcelHint}>{meta.hint}</Text>
            ) : null}
            {unresolved.map((parcel) => (
              <View
                key={parcel.parcelId}
                style={[styles.metaRow, styles.metaRowTop]}
              >
                <MaterialIcons
                  name="error-outline"
                  size={15}
                  color={theme.danger}
                  style={styles.metaIconTop}
                />
                <Text style={[styles.metaText, styles.metaTextGrow]}>
                  {parcel.parcelCode ?? parcel.parcelId} —{" "}
                  {incidentTypeLabel(parcel.incidentType)}.{" "}
                  {recommendedActionLabel(parcel.recommendedAction)}
                </Text>
              </View>
            ))}
            {/* §10: còn kiện chưa xử lý thì chỉ tài xế được phân công mới hoàn
                tất chuyến được (clearance ACKNOWLEDGED_INCIDENTS). */}
            {result.requiresDriverCompletion ? (
              <Text style={styles.parcelHint}>
                Còn kiện chưa giao nên chỉ tài xế mới kết thúc chuyến được.
                Báo tài xế trước khi rời bến.
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={[styles.metaText, styles.metaTextGrow]}>
            Giao xong hết thì bấm kiểm. Kiện nào còn sót sẽ được mở phiếu tìm.
          </Text>
        )}

        <ActionButton
          icon="fact-check"
          label={reconcile.isPending ? "Đang kiểm…" : "Kiểm lại kiện tại bến"}
          tone="secondary"
          small
          disabled={reconcile.isPending}
          onPress={() => reconcile.mutate(undefined, { onSuccess: setResult })}
        />
      </View>
    </SurfaceCard>
  );
}

// Đối soát kiện của điểm dừng hiện tại trước khi xe rời đi (§8.3). Kiện chưa
// có custody event tại điểm này sẽ bị backend mở incident UNSCANNED_HANDOFF —
// UI chỉ cho phép chốt điểm dừng khi canDepart=true.
function StopReconcileSection({
  tripId,
  stopId,
  stopName,
  items,
}: {
  tripId: string;
  stopId: string;
  stopName: string;
  items: AssistantParcelItem[];
}) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const reconcile = useReconcileStop(tripId);
  const [result, setResult] = useState<StopReconcileData | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  // Chỉ dùng để hiển thị "N kiện cần trả tại đây". Playbook v2 §9: FE KHÔNG
  // còn tự tổng hợp danh sách kiện đã quét gửi lên — backend tính từ custody
  // event của chính nó, gửi kèm danh sách là bị từ chối vì field lạ.
  const stopParcels = items.filter(
    (parcel) =>
      (parcel.dropoffStopId ?? parcel.dropoffLocation?.id ?? null) === stopId,
  );

  const unresolved = result?.unresolvedParcels ?? [];
  const errorMessage = tripOpsErrorMessage(reconcile.error);
  // Guide (2) §F2: chỉ cần lý do; người duyệt lấy từ JWT của tài xế.
  const overrideReady = overrideReason.trim().length > 0;
  const approvalRequest = result?.departureOverrideRequest ?? null;

  const run = (withOverride: boolean) => {
    reconcile.mutate(
      {
        stopId,
        // Happy case gửi `{}`; chỉ khi xin rời điểm mới kèm lý do.
        input: withOverride
          ? { departureOverrideReason: overrideReason.trim() }
          : {},
      },
      { onSuccess: setResult },
    );
  };

  return (
    <SurfaceCard delay={100}>
      <SectionTitle
        icon="fact-check"
        title="Đối soát trước khi rời điểm"
        subtitle={`${stopName} • ${stopParcels.length} kiện cần trả tại đây`}
      />
      <View style={styles.metaStack}>
        <Text style={[styles.metaText, styles.metaTextGrow]}>
          Đối soát để chắc chắn không bỏ sót kiện nào tại điểm này. Kiện chưa
          quét sẽ được mở phiếu tìm kiếm tự động.
        </Text>
        {errorMessage ? (
          <Text style={styles.errorText}>{errorMessage}</Text>
        ) : null}

        {result ? (
          <>
            <View style={styles.metaRow}>
              <StatusChip
                label={result.canDepart ? "Đủ điều kiện rời điểm" : "Còn thiếu kiện"}
                tone={result.canDepart ? "success" : "danger"}
              />
              <Text style={[styles.metaText, styles.metaTextGrow]}>
                Đã quét {result.scannedCount}/{result.expectedCount}
                {result.manualExceptionCount > 0
                  ? ` • ${result.manualExceptionCount} kiện có sự cố`
                  : ""}
              </Text>
            </View>
            {unresolved.map((parcel) => (
              <View key={parcel.parcelId} style={[styles.metaRow, styles.metaRowTop]}>
                <MaterialIcons
                  name="error-outline"
                  size={15}
                  color={theme.danger}
                  style={styles.metaIconTop}
                />
                <Text style={[styles.metaText, styles.metaTextGrow]}>
                  {parcel.parcelCode ?? parcel.parcelId} —{" "}
                  {incidentTypeLabel(parcel.incidentType)}.{" "}
                  {recommendedActionLabel(parcel.recommendedAction)}
                </Text>
              </View>
            ))}
            {!result.canDepart ? (
              <>
                <Text style={styles.parcelHint}>
                  Vẫn phải chạy tiếp thì ghi lý do rồi gửi. Hệ thống mở phiếu
                  xin rời điểm để tài xế duyệt bằng tài khoản của chính mình —
                  phụ xe không tự duyệt thay được.
                </Text>
                <TextInput
                  placeholder="Lý do rời điểm khi còn thiếu kiện"
                  placeholderTextColor={theme.placeholder}
                  style={styles.weighInput}
                  value={overrideReason}
                  onChangeText={setOverrideReason}
                />
                {/* Phiếu đã mở: đưa mã cho tài xế mở trên máy của họ. Endpoint
                    duyệt chưa production-ready (§22 gap 6) nên app chỉ hiển
                    thị, không tự gọi API duyệt. */}
                {approvalRequest ? (
                  <View style={styles.metaRow}>
                    <MaterialIcons
                      name="how-to-reg"
                      size={15}
                      color={theme.textSecondary}
                    />
                    <Text style={[styles.metaText, styles.metaTextGrow]}>
                      Đã gửi phiếu xin rời điểm (mã{" "}
                      {approvalRequest.requestId.slice(0, 8)}). Báo tài xế mở
                      máy duyệt rồi mới rời bến.
                    </Text>
                  </View>
                ) : null}
                <ActionButton
                  icon="verified-user"
                  label={
                    reconcile.isPending ? "Đang gửi…" : "Đối soát kèm phê duyệt"
                  }
                  tone="secondary"
                  small
                  disabled={reconcile.isPending || !overrideReady}
                  onPress={() => run(true)}
                />
              </>
            ) : null}
          </>
        ) : null}

        <ActionButton
          icon="fact-check"
          label={
            reconcile.isPending
              ? "Đang đối soát…"
              : result
                ? "Đối soát lại"
                : "Đối soát điểm dừng"
          }
          tone="primary"
          small
          disabled={reconcile.isPending}
          onPress={() => run(false)}
        />
      </View>
    </SurfaceCard>
  );
}

export function ParcelCard({
  parcel,
  tripId,
  custodyV2,
  currentStopId,
  atDestination,
  destinationStationId,
  currentLocation,
  originLocation,
  expanded = true,
  onToggleExpand,
}: {
  parcel: AssistantParcelItem;
  tripId: string;
  // Thu gọn/bung card. Mặc định bung để các chỗ dùng khác không đổi hành vi.
  expanded?: boolean;
  onToggleExpand?: () => void;
  // Backend đã trả contract custody v2 (availableActions/custody/incident).
  custodyV2: boolean;
  currentStopId: string | null;
  atDestination: boolean;
  destinationStationId: string | null;
  currentLocation: ParcelLocationRef | null;
  // Bến đầu từ route.origin — dùng khi chuyến chưa có vị trí vận hành (§7).
  originLocation: ParcelLocationRef | null;
}) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const statusMeta = parcelStatusMeta(parcel.status);
  // §11: KHÔNG tự suy thao tác từ status khi backend đã trả availableActions.
  const actions = resolveParcelActions(parcel);

  const checkIn = useCheckInParcel(tripId);
  const reweigh = useReweighParcel(tripId);
  const load = useLoadParcel(tripId);
  const unload = useUnloadParcel(tripId);
  const deliver = useDeliverParcel(tripId);
  const confirmDelivery = useConfirmParcelDelivery(tripId);
  const confirmTransfer = useConfirmParcelTransfer(tripId);
  const resendEmail = useResendDeliveryEmail(tripId);
  const custodyException = useCustodyException(tripId);
  const confirmFound = useConfirmFoundOnVehicle(tripId);
  const custodyScan = useCustodyScan(tripId);
  // Menu phụ của card (Playbook v2 §6) — mặc định đóng.
  const [moreOpen, setMoreOpen] = useState(false);

  // Panel đang mở: cân lại / xác nhận giao / báo sự cố / không.
  const [mode, setMode] = useState<"none" | "reweigh" | "confirm" | "exception">(
    "none",
  );
  const [len, setLen] = useState("");
  const [wid, setWid] = useState("");
  const [hei, setHei] = useState("");
  const [wgt, setWgt] = useState("");
  const [note, setNote] = useState("");

  // Form báo sự cố custody (§8.1).
  const [incidentType, setIncidentType] =
    useState<ParcelIncidentType>("WRONG_STOP");
  const [exceptionReason, setExceptionReason] = useState("");
  const [exceptionNote, setExceptionNote] = useState("");
  // Báo cáo sự cố vừa gửi, đang chờ Driver/điều hành duyệt. Giữ ở đây để card
  // hiển thị đúng "chờ duyệt" ngay cả khi manifest chưa kịp phản ánh incident.
  const [pendingApproval, setPendingApproval] =
    useState<CustodyExceptionApproval | null>(null);

  // Quét QR bắt buộc trước khi dỡ/ghi nhận custody (§10: không có nút bỏ qua).
  const [scanFor, setScanFor] = useState<
    "unload" | "confirm-transfer" | "confirm-found" | "custody-scan" | null
  >(
    null,
  );

  // Ảnh bằng chứng (uri cục bộ, tối đa 3) đính kèm check-in/deliver/sự cố.
  // Chỉ ASSISTANT upload được (Storage Rules), màn này vốn là màn assistant.
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
    resendEmail.isPending ||

    custodyException.isPending ||
    confirmFound.isPending ||
    custodyScan.isPending;

  const errorMessage = firstErrorMessage(
    checkIn.error,
    reweigh.error,
    load.error,
    unload.error,
    deliver.error,
    confirmDelivery.error,
    confirmTransfer.error,
    resendEmail.error,

    custodyException.error,
    confirmFound.error,
    custodyScan.error,
  );
  // 409 sai bến mang kèm expected/actual/requiredAction — hiển thị nguyên vẹn
  // thay vì chỉ một câu chung (§10).
  const mismatch = custodyLocationMismatch(unload.error);

  // Điểm trả KỲ VỌNG của kiện: stop dọc đường, hoặc bến cuối nếu không gắn stop.
  // Chỉ dùng để quyết định có bật nút dỡ hay không, KHÔNG gửi lên backend.
  // Phân loại theo `dropoffLocation.type`, KHÔNG suy từ "có id là route stop".
  // Kiện trả tại bến cuối có `dropoffStopId = null` nhưng `dropoffLocation` lại
  // mang id của bến — bản cũ vơ luôn id đó vào nhánh ROUTE_STOP, rồi so với
  // `currentStopId` (luôn null ở bến cuối) nên nút dỡ không bao giờ bật.
  const unloadLocation: ParcelUnloadLocation | null = parcel.dropoffStopId
    ? { kind: "ROUTE_STOP", id: parcel.dropoffStopId }
    : parcel.dropoffLocation?.type === "ROUTE_STOP" &&
        parcel.dropoffLocation.id
      ? { kind: "ROUTE_STOP", id: parcel.dropoffLocation.id }
      : parcel.dropoffLocation?.type === "DESTINATION_STATION" &&
          parcel.dropoffLocation.id
        ? { kind: "DESTINATION_STATION", id: parcel.dropoffLocation.id }
        : destinationStationId
          ? { kind: "DESTINATION_STATION", id: destinationStationId }
          : null;
  // Vị trí THỰC TẾ của xe lúc dỡ — đây mới là thứ gửi trong `actualLocation`
  // (guide (2) §B3: id phải là `currentOperationalLocation.location.id`).
  // Gửi điểm kỳ vọng vào đây thì expected luôn bằng actual, backend mất khả
  // năng phát hiện dỡ sai bến (409 PARCEL_CUSTODY_LOCATION_MISMATCH).
  const actualUnloadLocation: ParcelUnloadLocation | null =
    currentLocation?.type === "ROUTE_STOP" && currentStopId
      ? { kind: "ROUTE_STOP", id: currentStopId }
      : atDestination && destinationStationId
        ? { kind: "DESTINATION_STATION", id: destinationStationId }
        : null;
  // §10 bước 3: chỉ bật nút dỡ khi điểm trả của kiện trùng vị trí xe đang dừng.
  const unloadHere = !custodyV2
    ? true
    : unloadLocation?.kind === "ROUTE_STOP"
      ? unloadLocation.id === currentStopId
      : unloadLocation?.kind === "DESTINATION_STATION"
        ? atDestination
        : false;

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

  // Vị trí + loại custody event cho lần quét tại đây (§8.2 chỉ nhận 4 loại
  // event). Nguồn vị trí theo guide §7: có vị trí vận hành thì dùng nó, KHÔNG
  // có (chuyến còn SCHEDULED/BOARDING, hoặc xe đang chạy giữa hai stop) thì rơi
  // về bến đầu route.origin — `currentOperationalLocation` null là hợp lệ, tuyệt
  // đối không lấy đó làm lý do chặn phụ xe quét.
  // Trả null chỉ khi thiếu locationId, vì §6.5 bắt buộc actualLocationId cho
  // mọi location type trừ VEHICLE — gửi thiếu là ăn 422.
  const custodyScanTarget = (): {
    eventType: ParcelCustodyScanEvent;
    locationType: ParcelCustodyLocationType;
    locationId: string;
    snapshot: string | null;
  } | null => {
    const source = currentLocation?.type ? currentLocation : originLocation;
    if (!source?.type || !source.id) {
      return null;
    }

    // Ma trận event của Playbook v2 §6:
    //   ACCEPTED         — bến đầu, TRƯỚC khi load;
    //   ARRIVED_AT_STOP  — điểm dừng đang ARRIVED;
    //   HANDOFF          — bàn giao tại stop/bến hiện tại của chuyến.
    // RETURNED_TO_STATION dành cho luồng hoàn hàng, KHÔNG dùng cho việc bàn
    // giao ở bến cuối — gửi sai event là backend từ chối.
    const eventType: ParcelCustodyScanEvent =
      source.type === "ORIGIN_STATION"
        ? "ACCEPTED"
        : source.type === "DESTINATION_STATION"
          ? "HANDOFF"
          : "ARRIVED_AT_STOP";

    return {
      eventType,
      locationType: source.type as ParcelCustodyLocationType,
      locationId: source.id,
      snapshot: source.name,
    };
  };

  // QR quét xong: đối chiếu ngay với mã của card. Không khớp thì DỪNG, không
  // tự đi tìm parcel khác (§10: giữ hàng, mở phần đối chiếu nhận dạng).
  const handleScanned = (raw: string) => {
    const target = scanFor;
    setScanFor(null);
    const code = raw.trim();
    if (code !== parcel.parcelCode) {
      Alert.alert(
        "Mã QR không khớp kiện này",
        `Tem vừa quét là ${code}, còn card đang mở là ${parcel.parcelCode}. Giữ hàng lại và đối chiếu ảnh/mô tả trước khi thao tác tiếp.`,
      );
      return;
    }

    if (target === "custody-scan") {
      const here = custodyScanTarget();
      if (!here) {
        Alert.alert(
          "Chưa xác định được vị trí ghi nhận",
          "Chuyến chưa có vị trí vận hành và dữ liệu bến đầu cũng thiếu mã điểm. Tải lại danh sách rồi thử lại.",
        );
        return;
      }
      custodyScan.mutate({
        parcelId: parcel.parcelId,
        input: {
          parcelCode: parcel.parcelCode,
          eventType: here.eventType,
          actualLocationType: here.locationType,
          actualLocationId: here.locationId,
          locationSnapshot: here.snapshot,
          evidenceReferences: [],
          reason: null,
        },
      });
      return;
    }

    if (target === "confirm-found") {
      const incidentId = parcel.activeIncident?.incidentId;
      if (!incidentId) {
        Alert.alert(
          "Kiện không còn phiếu tìm kiếm",
          "Sự cố đã được xử lý ở nơi khác. Tải lại danh sách để xem trạng thái mới.",
        );
        return;
      }
      confirmFound.mutate({
        parcelId: parcel.parcelId,
        input: {
          incidentId,
          parcelCode: parcel.parcelCode,
          evidenceReferences: [],
          note: null,
        },
      });
      return;
    }

    if (target === "confirm-transfer") {
      confirmTransfer.mutate({
        parcelId: parcel.parcelId,
        parcelCode: parcel.parcelCode,
      });
      return;
    }

    if (target === "unload") {
      if (!actualUnloadLocation) {
        Alert.alert(
          "Xe chưa dừng ở điểm nào",
          "Chỉ dỡ kiện khi xe đã tới điểm dừng và chưa rời đi. Chờ tài xế báo tới nơi rồi thử lại.",
        );
        return;
      }
      unload.mutate({
        parcelId: parcel.parcelId,
        input: {
          parcelCode: parcel.parcelCode,
          // Vị trí THỰC TẾ của xe, không phải điểm trả kỳ vọng của kiện.
          actualLocation: actualUnloadLocation,
          photoUrls: [],
        },
      });
      return;
    }

  };

  // Check-in/deliver/sự cố kèm ảnh: upload trước (nếu có), lỗi upload thì dừng
  // — không gửi thao tác thiếu ảnh mà phụ xe tưởng đã đính kèm.
  const submitWithEvidence = (kind: "check-in" | "delivery" | "custody") => {
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
          // evidence-upload tự throw Error tiếng Việt; lỗi Firebase SDK /
          // ApiError mang message tiếng Anh → thay bằng câu tiếng Việt.
          Alert.alert(
            "Không upload được ảnh",
            error instanceof ApiError || (error instanceof Error && error.name === "FirebaseError")
              ? "Upload ảnh thất bại. Kiểm tra mạng rồi thử lại."
              : error instanceof Error
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
      } else if (kind === "delivery") {
        deliver.mutate(
          { parcelId: parcel.parcelId, photoUrls },
          { onSuccess: clearPhotos },
        );
      } else {
        custodyException.mutate(
          {
            parcelId: parcel.parcelId,
            input: {
              incidentType,
              // Vị trí THỰC TẾ của kiện lúc phát hiện sự cố = chỗ xe đang đứng,
              // hoặc bến đầu nếu chuyến chưa chạy. Không có mã điểm hợp lệ thì
              // khai VEHICLE (§6.5: chỉ VEHICLE được để id null) — coi như kiện
              // còn trên xe, thay vì gửi id null cho một loại bến rồi ăn 422.
              ...(() => {
                const at = custodyScanTarget();
                return at
                  ? {
                      actualLocationType: at.locationType,
                      actualLocationId: at.locationId,
                      locationSnapshot: at.snapshot,
                    }
                  : {
                      actualLocationType: "VEHICLE" as ParcelCustodyLocationType,
                      actualLocationId: null,
                      locationSnapshot: currentLocation?.name ?? null,
                    };
              })(),
              description: exceptionNote.trim() || null,
              evidenceUrls: photoUrls ?? [],
              // KHÔNG gửi supervisorApprovalUserId/reviewerUserId: backend lấy
              // người báo cáo từ JWT của phụ xe (§6.6).
              reason: exceptionReason.trim(),
            },
          },
          {
            onSuccess: (approval) => {
              clearPhotos();
              setMode("none");
              setExceptionReason("");
              setExceptionNote("");
              // Backend mới chỉ tạo báo cáo chờ duyệt; card chuyển sang trạng
              // thái chờ và khóa nút gửi lại cùng sự cố.
              setPendingApproval(approval);
            },
          },
        );
      }
    };

    void run();
  };

  const hints = parcel.identityCheckHints;
  const custody = parcel.currentCustody;
  const incident = parcel.activeIncident;
  // Chỉ coi là "đang chờ" khi chính response nói vậy — replay idempotent có
  // thể trả về báo cáo đã được duyệt/từ chối, khi đó card phải đi theo
  // response chứ không giữ trạng thái chờ cũ (§16).
  const awaitingApproval = pendingApproval?.status === "PENDING_APPROVAL";
  const confidence = trackingConfidenceMeta(custody?.trackingConfidence);
  const identityPhoto = hints?.photoUrl ?? parcel.photoUrl;
  const description = hints?.description ?? parcel.description;

  // Chuyến chục kiện thì card đầy đủ cuộn mãi không hết — mặc định thu gọn,
  // chạm vào mới bung. Phần đầu (mã, người nhận, trạng thái, điểm trả) luôn
  // hiện vì đó là thứ phụ xe quét mắt để tìm kiện.
  const header = (
    <View style={styles.parcelTitleStack}>
      {/* Mã kiện chiếm trọn một dòng: 24 ký tự mono mà bị chip chen ngang
          thì gãy đôi, phụ xe dễ đọc nhầm khi đối chiếu tem. */}
      <Text style={styles.parcelCode} numberOfLines={1}>
        {parcel.parcelCode}
      </Text>
      {/* Tên và số điện thoại tách hai dòng. Gộp một dòng thì tên dài + số
          E.164 đẩy nhau gãy làm ba, chip trạng thái bị ép còn một mẩu. */}
      <View style={styles.parcelHeader}>
        <View style={styles.parcelPeopleBlock}>
          <Text style={styles.parcelPeople} numberOfLines={1}>
            {parcel.recipientName ?? "—"}
          </Text>
          {parcel.recipientPhone ? (
            <Text style={styles.parcelPhone} numberOfLines={1}>
              {formatPhone(parcel.recipientPhone)}
            </Text>
          ) : null}
        </View>
        <StatusChip label={statusMeta.label} tone={statusMeta.tone} />
      </View>
    </View>
  );

  if (!expanded) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onToggleExpand}
        style={styles.parcelCard}
      >
        {header}
        <View style={styles.metaRow}>
          <MaterialIcons name="place" size={15} color={theme.textSecondary} />
          <Text style={[styles.metaText, styles.metaTextGrow]} numberOfLines={1}>
            {locationLabel(parcel.dropoffLocation)}
          </Text>
          {/* Có sự cố thì phải thấy ngay ở dạng thu gọn, không bắt bung ra mới
              biết kiện đang có vấn đề. */}
          {incident ? (
            <MaterialIcons
              name="report-problem"
              size={16}
              color={theme.danger}
            />
          ) : null}
          <MaterialIcons
            name="expand-more"
            size={18}
            color={theme.textSecondary}
          />
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.parcelCard}>
      <Pressable accessibilityRole="button" onPress={onToggleExpand}>
        {header}
      </Pressable>

      {/* Sự cố đang mở: kiện đang do điều hành xử lý, không thao tác bừa. */}
      {incident ? (
        <View style={[styles.metaRow, styles.metaRowTop]}>
          <MaterialIcons
            name="report-problem"
            size={15}
            color={theme.danger}
            style={styles.metaIconTop}
          />
          <Text style={[styles.errorText, styles.metaTextGrow]}>
            {incidentTypeLabel(incident.type)} •{" "}
            {incidentStatusLabel(incident.status)}
            {incident.searchDeadline
              ? ` • hạn tìm ${formatTimeHM(incident.searchDeadline)}`
              : ""}
          </Text>
        </View>
      ) : null}

      {/* Báo cáo sự cố vừa gửi: chờ tài xế/điều hành duyệt. Chưa duyệt thì
          backend chưa ghi custody event và chưa mở SLA tìm kiếm, nên tuyệt
          đối không hiển thị "đang tìm kiếm" hay hạn tìm ở bước này (§6.6). */}
      {pendingApproval ? (
        <View style={[styles.metaRow, styles.metaRowTop]}>
          <MaterialIcons
            name={awaitingApproval ? "hourglass-top" : "verified"}
            size={15}
            color={awaitingApproval ? theme.textSecondary : theme.danger}
            style={styles.metaIconTop}
          />
          <Text style={[styles.metaText, styles.metaTextGrow]}>
            {incidentTypeLabel(pendingApproval.incidentType)} •{" "}
            {custodyApprovalStatusLabel(pendingApproval.status)}
            {awaitingApproval
              ? " • đã gửi cho tài xế/điều hành, chưa mở tìm kiếm"
              : ""}
            {pendingApproval.reviewNote
              ? ` • ghi chú: ${pendingApproval.reviewNote}`
              : ""}
          </Text>
        </View>
      ) : null}

      <View style={styles.metaStack}>
        <View style={styles.metaRow}>
          <MaterialIcons name="scale" size={15} color={theme.textSecondary} />
          <Text style={[styles.metaText, styles.metaTextGrow]}>
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

        {/* Điểm trả do backend tính sẵn — không suy từ dropoffStopId nữa. */}
        {parcel.dropoffLocation ? (
          <View style={styles.metaRow}>
            <MaterialIcons name="place" size={15} color={theme.textSecondary} />
            <Text style={[styles.metaText, styles.metaTextGrow]}>
              Trả tại {locationLabel(parcel.dropoffLocation)}
              {parcel.dropoffLocation.eta
                ? ` • dự kiến ${formatTimeHM(parcel.dropoffLocation.eta)}`
                : ""}
            </Text>
          </View>
        ) : null}

        {/* Custody: nơi kiện được ghi nhận lần cuối và mức tin cậy. */}
        {custody ? (
          <View style={styles.metaRow}>
            <MaterialIcons
              name="history"
              size={15}
              color={theme.textSecondary}
            />
            <Text style={[styles.metaText, styles.metaTextGrow]}>
              {custodyEventLabel(custody.lastEventType)}{" "}
              {locationPhrase(custody.lastConfirmedLocation)}
              {custody.lastConfirmedAt
                ? ` • ${formatTimeHM(custody.lastConfirmedAt)}`
                : ""}
            </Text>
            <StatusChip label={confidence.label} tone={confidence.tone} />
          </View>
        ) : null}
        {custody?.hasTrackingGap ? (
          <Text style={styles.parcelHint}>
            Chuỗi theo dõi bị đứt một đoạn. Quét lại QR để ghi nhận vị trí trước
            khi dỡ hoặc giao.
          </Text>
        ) : null}

        {parcel.status === "PENDING_FINAL_PAYMENT" ? (
          <View style={styles.metaRow}>
            <MaterialIcons name="payments" size={15} color={theme.textSecondary} />
            <Text style={[styles.metaText, styles.metaTextGrow]}>
              Khách còn thiếu{" "}
              {formatVnd(
                (parcel.paymentState?.balanceRequiredVnd ??
                  parcel.balanceRequiredVnd ??
                  0) -
                  (parcel.paymentState?.balancePaidVnd ??
                    parcel.balancePaidVnd ??
                    0),
              )}
              {parcel.finalPaymentDeadline
                ? ` • hạn ${formatTimeHM(parcel.finalPaymentDeadline)}`
                : ""}
            </Text>
          </View>
        ) : null}
        {/* Đổi xe do sự cố: kiện vẫn thuộc chuyến cũ cho tới khi xác nhận
            (FE-MOBILE-VEHICLE-SUBSTITUTION-PARCEL-TRANSFER.md). Nói rõ để phụ
            xe không tưởng hàng đã nằm sẵn trên xe mới. */}
        {parcel.status === "PENDING_TRANSFER_CONFIRM" ? (
          <View style={[styles.metaRow, styles.metaRowTop]}>
            <MaterialIcons
              name="swap-horiz"
              size={15}
              color={theme.textSecondary}
              style={styles.metaIconTop}
            />
            {/* Câu ngắn: dải cảnh báo của nhóm "Hàng chờ nhận từ xe cũ" đã nói
                đủ ngữ cảnh, lặp lại nguyên đoạn trên từng card làm card dài
                gấp đôi mà không thêm thông tin gì. */}
            <Text style={[styles.metaText, styles.metaTextGrow]}>
              Chuyển từ xe gặp sự cố — quét xác nhận sau khi đã bốc lên xe.
            </Text>
          </View>
        ) : null}
        {/* REJECTED gần như luôn là "quá hạn nhận kiện tại bến" (backend tự
            chuyển RESERVED → REJECTED khi qua latestCheckInAt = trước giờ chạy
            30 phút). Nói rõ để phụ xe khỏi tưởng app lỗi hay tự đi tìm nút. */}
        {parcel.status === "REJECTED" ? (
          <View style={[styles.metaRow, styles.metaRowTop]}>
            <MaterialIcons
              name="block"
              size={15}
              color={theme.textSecondary}
              style={styles.metaIconTop}
            />
            <Text style={[styles.metaText, styles.metaTextGrow]}>
              Kiện không được nhận tại bến trước giờ chốt nên hệ thống đã từ
              chối. Không xếp lên xe; khách liên hệ điều hành nếu cần gửi lại.
            </Text>
          </View>
        ) : null}
        {parcel.status === "TRANSFER_ESCALATED" ? (
          <View style={[styles.metaRow, styles.metaRowTop]}>
            <MaterialIcons
              name="report-problem"
              size={15}
              color={theme.textSecondary}
              style={styles.metaIconTop}
            />
            <Text style={[styles.metaText, styles.metaTextGrow]}>
              Đã quá hạn xác nhận chuyển kiện sang xe mới. Liên hệ điều hành để
              xử lý, không thao tác tiếp trên app.
            </Text>
          </View>
        ) : null}
        {description ? (
          // Mô tả từ backend có thể nhiều dòng → icon neo theo dòng đầu,
          // text co giãn để xuống dòng thay vì tràn khỏi card.
          <View style={[styles.metaRow, styles.metaRowTop]}>
            <MaterialIcons
              name="description"
              size={15}
              color={theme.textSecondary}
              style={styles.metaIconTop}
            />
            <Text style={[styles.metaText, styles.metaTextGrow]}>
              {description}
            </Text>
          </View>
        ) : null}

        {/* §11: bắt buộc cho phụ xe đối chiếu kiện vật lý trước khi xếp/dỡ. */}
        {hints &&
        (actions.includes("load") ||
          actions.includes("unload") ||
          actions.includes("deliver")) ? (
          <View style={styles.evidenceRow}>
            {identityPhoto ? (
              <Image
                source={{ uri: identityPhoto }}
                style={styles.evidenceThumb}
              />
            ) : null}
            <Text style={[styles.metaText, styles.metaTextGrow]}>
              Đối chiếu:{" "}
              {hints.expectedWeightKg != null
                ? `nặng ~${hints.expectedWeightKg}kg`
                : "chưa có cân ước tính"}
              {hints.actualWeightKg != null
                ? ` (đã cân ${hints.actualWeightKg}kg)`
                : ""}
              {hints.expectedLengthCm != null &&
              hints.expectedWidthCm != null &&
              hints.expectedHeightCm != null
                ? ` • ${hints.expectedLengthCm}×${hints.expectedWidthCm}×${hints.expectedHeightCm}cm`
                : ""}
            </Text>
          </View>
        ) : null}
      </View>

      {errorMessage ? (
        <Text style={styles.parcelHint}>{errorMessage}</Text>
      ) : null}
      {mismatch ? (
        <Text style={styles.errorText}>
          Điểm trả đúng của kiện: {mismatch.expectedStop ?? "—"}. Điểm vừa thao
          tác: {mismatch.actualStop ?? "—"}.{" "}
          {recommendedActionLabel(mismatch.requiredAction)}
        </Text>
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
            // Guide (2) §16: confirmNote tối đa 500 ký tự — chặn ngay ở ô nhập
            // thay vì để phụ xe gõ xong mới ăn 422.
            maxLength={500}
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
      ) : mode === "exception" ? (
        // §6.6: báo sự cố custody. Phụ xe chỉ TẠO báo cáo chờ duyệt — không
        // chọn người duyệt, không tự mở tìm kiếm.
        <View style={styles.weighStack}>
          <Text style={styles.fieldLabel}>Loại sự cố</Text>
          <View style={styles.segmentRow}>
            {(
              [
                ["WRONG_STOP", "Dỡ nhầm điểm"],
                ["PACKAGE_IDENTITY_MISMATCH", "Kiện không khớp"],
                ["UNSCANNED_HANDOFF", "Không quét được QR"],
              ] as [ParcelIncidentType, string][]
            ).map(([value, label]) => (
              <ActionButton
                key={value}
                label={label}
                tone={incidentType === value ? "primary" : "ghost"}
                small
                disabled={busy}
                onPress={() => setIncidentType(value)}
              />
            ))}
          </View>
          <TextInput
            placeholder="Lý do (bắt buộc)"
            placeholderTextColor={theme.placeholder}
            style={styles.weighInput}
            value={exceptionReason}
            onChangeText={setExceptionReason}
          />
          <TextInput
            placeholder="Mô tả thêm (tuỳ chọn)"
            placeholderTextColor={theme.placeholder}
            style={styles.weighInput}
            value={exceptionNote}
            onChangeText={setExceptionNote}
          />
          <EvidencePicker
            uris={evidenceUris}
            max={MAX_EVIDENCE_PHOTOS}
            label="Ảnh hiện trường"
            disabled={busy || uploadingEvidence}
            onAdd={() => setEvidenceCameraOpen(true)}
            onRemove={(uri) =>
              setEvidenceUris((current) =>
                current.filter((item) => item !== uri),
              )
            }
          />
          <Text style={styles.parcelHint}>
            Gửi xong báo cáo sẽ chờ tài xế hoặc điều hành phê duyệt. Chỉ khi
            được duyệt hệ thống mới mở phiếu tìm kiếm. Không gửi trùng nếu kiện
            đã có sự cố đang mở.
          </Text>
          <View style={styles.segmentRow}>
            <ActionButton
              label={
                uploadingEvidence
                  ? "Đang tải ảnh…"
                  : custodyException.isPending
                    ? "Đang gửi…"
                    : "Gửi báo sự cố"
              }
              tone="primary"
              small
              disabled={
                busy ||
                uploadingEvidence ||
                exceptionReason.trim().length === 0
              }
              onPress={() => submitWithEvidence("custody")}
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
              <EvidencePicker
                uris={evidenceUris}
                max={MAX_EVIDENCE_PHOTOS}
                label="Ảnh bằng chứng"
                disabled={busy || uploadingEvidence}
                onAdd={() => setEvidenceCameraOpen(true)}
                onRemove={(uri) =>
                  setEvidenceUris((current) =>
                    current.filter((item) => item !== uri),
                  )
                }
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
              // Guide §12: kiện CHECKED_IN thì cân/đo là CTA CHÍNH, không phải
              // custody scan — nên nhấn primary để phụ xe không bấm nhầm nút.
              label={
                parcel.status === "CHECKED_IN" ? "Cân/đo thực tế" : "Cân lại"
              }
              tone={parcel.status === "CHECKED_IN" ? "primary" : "secondary"}
              small
              disabled={busy}
              onPress={() => setMode("reweigh")}
            />
          ) : null}
          {actions.includes("unload") ? (
            <ActionButton
              icon="file-download"
              label={
                unload.isPending
                  ? "Đang dỡ…"
                  : custodyV2
                    ? "Quét QR và dỡ kiện"
                    : "Dỡ kiện"
              }
              tone="primary"
              small
              disabled={busy || (custodyV2 && !unloadHere)}
              onPress={() => {
                // Contract cũ chưa nhận body → gọi như trước.
                if (!custodyV2) {
                  unload.mutate({ parcelId: parcel.parcelId });
                  return;
                }
                setScanFor("unload");
              }}
            />
          ) : null}
          {actions.includes("unload") && custodyV2 && !unloadHere ? (
            <Text style={styles.parcelHint}>
              Kiện này trả tại {locationLabel(parcel.dropoffLocation)}, chưa
              phải chỗ xe đang dừng. Giữ kiện trên xe.
            </Text>
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
          {/* Chỉ crew chuyến ĐÍCH được xác nhận — crew chuyến cũ mở cùng kiện
              thì không thấy nút (doc §Manifest của crew mới). */}
          {actions.includes("confirm-transfer") &&
          canConfirmTransferHere(parcel, tripId) ? (
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
              // Guide (2) §14: crew chuyến đích QUÉT QR THẬT trên kiện rồi mới
              // xác nhận — mã quét phải khớp phiếu chuyển. Hỏi miệng không đủ:
              // xác nhận xong backend đổi tripId và không hoàn tác được.
              onPress={() => setScanFor("confirm-transfer")}
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
          {/* Ghi nhận vị trí đã gộp về nút "Quét QR kiện hàng" đầu màn: quét
              một phát là ghi nhận luôn, không bắt tìm card rồi bấm thêm. Card
              chỉ còn các bước đổi trạng thái của vòng đời kiện. */}
          {/* Kiện bị mở phiếu tìm kiếm nhưng thực ra vẫn nằm trên xe. Đây là
              đường DUY NHẤT để crew gỡ kiện khỏi PENDING_OPERATOR_ACTION mà
              không phải nhờ điều hành (Playbook v2 §8) → để primary. */}
          {actions.includes("confirm-found-on-vehicle") ? (
            <ActionButton
              icon="inventory"
              label={
                confirmFound.isPending
                  ? "Đang xác nhận…"
                  : "Kiện vẫn trên xe — xác nhận"
              }
              tone="primary"
              small
              disabled={busy}
              onPress={() => setScanFor("confirm-found")}
            />
          ) : null}
          {actions.includes("custody-exception") ? (
            <ActionButton
              icon="report-problem"
              label={
                awaitingApproval ? "Đã gửi, chờ duyệt" : "Báo sự cố kiện"
              }
              tone="ghost"
              small
              // Đã gửi báo cáo mà chưa có kết quả duyệt thì không cho gửi lại
              // cùng một sự cố (§6.6).
              disabled={busy || awaitingApproval}
              onPress={() => setMode("exception")}
            />
          ) : null}
          {/* Menu phụ: Playbook v2 §6 cấm đặt "Ghi nhận bàn giao/vị trí" cạnh
              nút nghiệp vụ chính (Xếp/Dỡ) vì phụ xe hay bấm nhầm nó thay cho
              thao tác thật. Gấp lại, chỉ mở khi cần ghi nhận bổ sung. */}
          {actions.includes("custody-scan") ? (
            moreOpen ? (
              <>
                <ActionButton
                  icon="qr-code-scanner"
                  label={
                    custodyScan.isPending
                      ? "Đang ghi nhận…"
                      : "Ghi nhận bàn giao/vị trí"
                  }
                  tone="ghost"
                  small
                  disabled={busy}
                  onPress={() => setScanFor("custody-scan")}
                />
                <Text style={styles.parcelHint}>
                  Chỉ dùng khi cần ghi thêm một mốc bàn giao thật (giao cho nhân
                  viên bến, kiểm kê dọc đường). Nhận kiện, xếp, dỡ và giao đã tự
                  ghi nhận rồi.
                </Text>
              </>
            ) : (
              <ActionButton
                icon="more-horiz"
                label="Thêm thao tác"
                tone="ghost"
                small
                disabled={busy}
                onPress={() => setMoreOpen(true)}
              />
            )
          ) : null}
          {actions.length === 0 ? (
            <Text style={styles.parcelHint}>
              Không có thao tác cho trạng thái hiện tại.
            </Text>
          ) : null}
        </View>
      )}

      {/* Camera và scanner dùng chung cho mọi panel của card. */}
      <EvidenceCameraModal
        visible={evidenceCameraOpen}
        title={`Chụp ảnh bằng chứng • ${parcel.parcelCode}`}
        count={evidenceUris.length}
        max={MAX_EVIDENCE_PHOTOS}
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
      <QrScannerModal
        visible={scanFor != null}
        title={`Quét QR • ${parcel.parcelCode}`}
        hint={
          scanFor === "confirm-transfer"
            ? "Kiện đã bốc lên xe rồi thì quét tem để xác nhận nhận hàng."
            : "Quét đúng tem trên kiện đang cầm trên tay."
        }
        onScanned={handleScanned}
        onClose={() => setScanFor(null)}
      />
    </View>
  );
}

export function AssistantStopsScreen() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const activeTrip = useSelectedTrip();
  const tripId = activeTrip.trip?.tripId ?? null;
  const detailsQuery = useTripDetails(tripId);
  const details = detailsQuery.data;

  const arriveStop = useArriveAtStop(tripId);
  const departStop = useDepartFromStop(tripId);
  const arriveDestination = useArriveAtDestination(tripId);

  const tripRunning =
    normalizeTripStatus(activeTrip.trip?.status) === "IN_PROGRESS";
  const busy =
    arriveStop.isPending || departStop.isPending || arriveDestination.isPending;
  const errorMessage = firstErrorMessage(
    arriveStop.error,
    departStop.error,
    arriveDestination.error,
  );
  // Rời điểm bị Parcel service chặn vì còn kiện chưa đối soát: backend gửi kèm
  // `approvalRequestId` để mở đúng phiếu phụ xe đã tạo (Guide (2) §F5).
  const blockedApprovalId = stopDepartureBlocked(departStop.error);

  // Điểm đã chốt rời trong phiên này. Cache KHOÁ THEO tripId (FE-PCL-001):
  // hai chuyến dùng chung route thì dùng chung luôn stopId, khoá theo mỗi
  // stopId sẽ làm chuyến sau tưởng đã rời điểm và mất nút "Rời điểm này".
  const { isDeparted, markDeparted } = useDepartedStops(tripId);

  const handleDepart = (stopId: string) => {
    departStop.mutate(stopId, {
      onSuccess: () => {
        markDeparted(stopId);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
      onError: (error) => {
        // Đã chốt từ trước (bấm hai lần, hoặc phụ xe/hệ thống chốt hộ) thì coi
        // như xong: ẩn nút đi thay vì bắt tài xế đọc lỗi.
        if (error instanceof ApiError && error.code === "TRIP_STOP_ALREADY_DEPARTED") {
          markDeparted(stopId);
        }
      },
    });
  };

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
        <EmptyCard
          message={withNextAssignedHint(
            "Chưa có chuyến nào đang chạy.",
            activeTrip.nextAssignedTrip,
          )}
        />
      ) : detailsQuery.isError ? (
        <ErrorCard
          message="Không tải được chi tiết chuyến."
          onRetry={() => void detailsQuery.refetch()}
        />
      ) : details ? (
        <>
          <TripPicker subtitle="Chọn ca cần xem điểm dừng." />

          <SurfaceCard accent delay={0}>
            {details.alternativeRouteId ? (
              <StatusChip label="Đang chạy tuyến thay thế" tone="warning" />
            ) : null}
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
            onDepart={handleDepart}
            isStopDeparted={isDeparted}
            actionDisabled={!tripRunning || busy}
            pendingStopId={
              arriveStop.isPending
                ? arriveStop.variables
                : departStop.isPending
                  ? departStop.variables
                  : null
            }
          />

          {/* Parcel service chặn rời điểm khi còn kiện chưa đối soát. Mở đúng
              phiếu phụ xe đã tạo, KHÔNG tự dựng phê duyệt cục bộ (§19). */}
          {blockedApprovalId ? (
            <SurfaceCard delay={150}>
              <SectionTitle
                icon="pending-actions"
                title="Chưa rời điểm được"
                subtitle="Phụ xe đã xin rời điểm khi còn kiện thiếu — cần tài xế duyệt."
              />
              <ActionButton
                icon="how-to-reg"
                label="Mở phiếu xin rời điểm"
                tone="primary"
                onPress={() =>
                  router.push(
                    `/driver/parcel-approval?requestId=${blockedApprovalId}` as Href,
                  )
                }
              />
            </SurfaceCard>
          ) : null}

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

// ---------------------------------------------------------------------------
// Hiển thị câu trả lời của trợ lý (RAG)
// Backend trả markdown thô (**đậm**, `*` đầu dòng, ### tiêu đề). RN không render
// markdown nên trước đây user thấy nguyên ký tự sao. Parser nhẹ dưới đây đủ cho
// định dạng RAG hay dùng, không thêm dependency và chịu được text đang stream
// (cú pháp chưa đóng thì để nguyên văn).
// ---------------------------------------------------------------------------

type InlineToken = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
};

type MarkdownBlock =
  | { kind: "heading"; text: string }
  | { kind: "bullet"; marker: string; text: string }
  | { kind: "paragraph"; text: string };

const INLINE_PATTERN = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*)/g;
const HEADING_PATTERN = /^\s{0,3}#{1,6}\s+(.*)$/;
const BULLET_PATTERN = /^\s*[-*•]\s+(.*)$/;
const ORDERED_PATTERN = /^\s*(\d{1,2})[.)]\s+(.*)$/;

function parseInline(raw: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let cursor = 0;

  for (const match of raw.matchAll(INLINE_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      tokens.push({ text: raw.slice(cursor, start) });
    }

    const chunk = match[0];
    if (chunk.startsWith("**") || chunk.startsWith("__")) {
      tokens.push({ text: chunk.slice(2, -2), bold: true });
    } else if (chunk.startsWith("`")) {
      tokens.push({ text: chunk.slice(1, -1), code: true });
    } else {
      tokens.push({ text: chunk.slice(1, -1), italic: true });
    }
    cursor = start + chunk.length;
  }

  if (cursor < raw.length) {
    tokens.push({ text: raw.slice(cursor) });
  }

  return tokens.length > 0 ? tokens : [{ text: raw }];
}

function parseMarkdownBlocks(raw: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  // Dòng trống ngắt block; dòng thường nối tiếp block trước (text bị wrap).
  let canContinue = false;

  for (const line of raw.split("\n")) {
    if (line.trim().length === 0) {
      canContinue = false;
      continue;
    }

    const heading = HEADING_PATTERN.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", text: heading[1].trim() });
      canContinue = false;
      continue;
    }

    const ordered = ORDERED_PATTERN.exec(line);
    if (ordered) {
      blocks.push({
        kind: "bullet",
        marker: `${ordered[1]}.`,
        text: ordered[2].trim(),
      });
      canContinue = true;
      continue;
    }

    const bullet = BULLET_PATTERN.exec(line);
    if (bullet) {
      blocks.push({ kind: "bullet", marker: "•", text: bullet[1].trim() });
      canContinue = true;
      continue;
    }

    const previous = blocks[blocks.length - 1];
    if (canContinue && previous && previous.kind !== "heading") {
      previous.text = `${previous.text} ${line.trim()}`;
      continue;
    }

    blocks.push({ kind: "paragraph", text: line.trim() });
    canContinue = true;
  }

  return blocks;
}

function InlineMarkdown({
  text,
  style,
}: {
  text: string;
  style: ComponentProps<typeof Text>["style"];
}) {
  const styles = useThemedStyles(makeStyles);
  const tokens = useMemo(() => parseInline(text), [text]);

  return (
    <Text style={style}>
      {tokens.map((token, index) => (
        <Text
          key={`${index}-${token.text}`}
          style={[
            token.bold ? styles.markdownBold : null,
            token.italic ? styles.markdownItalic : null,
            token.code ? styles.markdownCode : null,
          ]}
        >
          {token.text}
        </Text>
      ))}
    </Text>
  );
}

function MarkdownText({ text }: { text: string }) {
  const styles = useThemedStyles(makeStyles);
  const blocks = useMemo(() => parseMarkdownBlocks(text), [text]);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <View style={styles.markdownStack}>
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          return (
            <InlineMarkdown
              key={`h-${index}`}
              text={block.text}
              style={styles.markdownHeading}
            />
          );
        }

        if (block.kind === "bullet") {
          return (
            <View key={`b-${index}`} style={styles.markdownBulletRow}>
              <Text style={styles.markdownBulletMarker}>{block.marker}</Text>
              <InlineMarkdown
                text={block.text}
                style={styles.markdownBulletText}
              />
            </View>
          );
        }

        return (
          <InlineMarkdown
            key={`p-${index}`}
            text={block.text}
            style={styles.messageText}
          />
        );
      })}
    </View>
  );
}

// Một chấm nhấp nháy của indicator "đang soạn"; delay lệch nhau tạo hiệu ứng sóng.
function TypingDot({ delay }: { delay: number }) {
  const styles = useThemedStyles(makeStyles);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 360, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 360, easing: Easing.in(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.32 + progress.value * 0.68,
    transform: [{ translateY: -3 * progress.value }],
  }));

  return <Animated.View style={[styles.typingDot, animatedStyle]} />;
}

// Placeholder khi RAG đang stream nhưng chưa có token nào.
function TypingIndicator() {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.typingRow}>
      <TypingDot delay={0} />
      <TypingDot delay={140} />
      <TypingDot delay={280} />
      <Text style={styles.typingLabel}>Đang soạn câu trả lời…</Text>
    </View>
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
      // ragErrorMessage diễn giải mã RAG_* thành lý do cụ thể (quá tải, câu hỏi
      // quá dài…); mã lạ rơi về câu chung tiếng Việt — không lộ tiếng Anh.
      appendToMessage(answerId, ragErrorMessage(error));
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
              {message.speaker === "assistant" ? (
                message.text.length === 0 ? (
                  // Chưa có token nào → hiện indicator thay cho bong bóng rỗng.
                  <TypingIndicator />
                ) : (
                  <MarkdownText text={message.text} />
                )
              ) : (
                <Text style={styles.messageText}>{message.text}</Text>
              )}
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
            {streaming ? (
              <ActivityIndicator size="small" color={theme.onAccent} />
            ) : (
              <MaterialIcons name="send" size={20} color={theme.onAccent} />
            )}
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
  onDepart,
  isStopDeparted,
  actionDisabled = false,
  pendingStopId = null,
}: {
  details: TripDetails;
  nextStopId: string | null;
  liveEtas?: Map<string, TripTargetEta>;
  // Stop server báo xe đã tới gần → nhấn mạnh để crew bấm xác nhận.
  attentionStopId?: string | null;
  onArrive?: (stopId: string) => void;
  // Rời điểm — chỉ hiện sau khi đã tới điểm đó (Guide (2) §B6).
  onDepart?: (stopId: string) => void;
  // Điểm vừa chốt rời trong phiên này (backend detail có thể chưa trả mốc rời).
  // Nhận predicate chứ không nhận mảng stopId: cache phía trên khoá theo
  // tripId, card không được tự suy trạng thái từ danh sách trần (FE-PCL-001).
  isStopDeparted?: (stopId: string) => boolean;
  actionDisabled?: boolean;
  pendingStopId?: string | null;
}) {
  const styles = useThemedStyles(makeStyles);
  const stops = [...details.stops].sort((a, b) => a.orderIndex - b.orderIndex);

  // Điểm đi / bến cuối là 2 mốc cố định của timeline — tuyến đi thẳng (0 điểm
  // dừng giữa) vẫn có hành trình hoàn chỉnh thay vì card trống. Hai mốc này chỉ
  // hiển thị, không có nút: xác nhận tới bến cuối đã có card "Bến cuối" riêng lo.
  const tripStatus = normalizeTripStatus(details.status);
  const departed = tripStatus === "IN_PROGRESS" || tripStatus === "COMPLETED";
  const tripCompleted = tripStatus === "COMPLETED";

  return (
    <SurfaceCard delay={120}>
      <SectionTitle icon="route" title="Tiến trình tuyến" />

      <View style={styles.stopStack}>
        <View style={styles.stopRow}>
          <View style={styles.stopMarkerColumn}>
            <View
              style={[styles.stopMarker, departed && styles.stopMarkerCompleted]}
            />
            <View style={departed ? styles.stopLineActive : styles.stopLine} />
          </View>

          <View style={styles.stopContent}>
            <View style={styles.stopHeader}>
              <View style={styles.stopNameBlock}>
                <Text style={styles.stopTitle}>
                  {details.originStation?.name || "Điểm đi"}
                </Text>
                <Text style={styles.stopSubtitle}>Điểm xuất phát</Text>
              </View>
              <StatusChip
                label={departed ? "Đã xuất phát" : "Điểm đi"}
                tone={departed ? "success" : "neutral"}
              />
            </View>
            <Text style={styles.stopMeta}>
              {`Khởi hành ${formatTimeHM(details.departureDateTime)}`}
            </Text>
          </View>
        </View>

        {stops.map((stop) => {
          const arrived = stop.status === "ARRIVED";
          const stopDeparted =
            stop.actualDepartureTime != null ||
            (isStopDeparted?.(stop.stopId) ?? false);
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

                {/* Đã tới điểm này rồi mới rời được. Phụ xe phải đối soát xong
                    kiện, nếu không backend chặn bằng
                    PARCEL_STOP_RECONCILIATION_REQUIRED. Chốt xong thì đổi
                    thành dòng trạng thái — nút biến mất để không bấm lần hai. */}
                {onDepart && arrived ? (
                  stopDeparted ? (
                    <Text style={styles.stopMeta}>
                      {stop.actualDepartureTime
                        ? `Đã rời điểm lúc ${formatTimeHM(stop.actualDepartureTime)}`
                        : "Đã chốt rời điểm này"}
                    </Text>
                  ) : (
                    <ActionButton
                      icon="logout"
                      label={
                        pendingStopId === stop.stopId
                          ? "Đang ghi nhận…"
                          : "Rời điểm này"
                      }
                      tone="secondary"
                      small
                      disabled={actionDisabled}
                      onPress={() => onDepart(stop.stopId)}
                    />
                  )
                ) : null}
              </View>
            </View>
          );
        })}

        <View style={styles.stopRow}>
          <View style={styles.stopMarkerColumn}>
            <View
              style={[
                styles.stopMarker,
                tripCompleted && styles.stopMarkerCompleted,
              ]}
            />
          </View>

          <View style={styles.stopContent}>
            <View style={styles.stopHeader}>
              <View style={styles.stopNameBlock}>
                <Text style={styles.stopTitle}>
                  {details.destinationStation?.name || "Bến cuối"}
                </Text>
                <Text style={styles.stopSubtitle}>Bến cuối</Text>
              </View>
              <StatusChip
                label={tripCompleted ? "Đã đến" : "Bến cuối"}
                tone={tripCompleted ? "success" : "neutral"}
              />
            </View>
            <Text style={styles.stopMeta}>
              {`Dự kiến ${formatTimeHM(details.estimatedArrivalTime)}`}
            </Text>
          </View>
        </View>
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
  exceptionBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: Spacing.two,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: 10,
  },
  exceptionBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
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
    borderColor: c.tones.danger.border,
    backgroundColor: c.tones.danger.background,
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
  // Bảng trượt từ dưới lên cho thông tin ghế.
  sheetScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: c.scrim,
  },
  sheet: {
    backgroundColor: c.panel,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    bottom: 0,
    gap: Spacing.three,
    left: 0,
    padding: Spacing.four,
    paddingBottom: Spacing.five,
    position: "absolute",
    right: 0,
  },
  sheetHandle: {
    alignSelf: "center",
    backgroundColor: c.border,
    borderRadius: 999,
    height: 4,
    width: 44,
  },
  sheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.two,
    justifyContent: "space-between",
  },
  sheetTitle: {
    color: c.text,
    fontFamily: Fonts.rounded,
    fontSize: 20,
    fontWeight: 700,
  },
  listStack: {
    gap: Spacing.three,
  },
  // Chip lọc danh sách kiện — xuống dòng được vì nhãn tiếng Việt khá dài.
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  filterChip: {
    borderColor: c.border,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
  },
  filterChipActive: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  filterChipText: {
    color: c.textSecondary,
    fontSize: 12,
    fontWeight: 600,
  },
  filterChipTextActive: {
    color: c.onAccent,
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
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  // Dải hành lang: các dải nối nhau theo hàng tạo cảm giác lối đi chạy dọc xe.
  seatAisleStrip: {
    width: 16,
    height: 42,
    borderRadius: 6,
    backgroundColor: c.tones.neutral.background,
  },
  seatAisleLegend: {
    backgroundColor: c.tones.neutral.background,
    borderColor: c.tones.neutral.border,
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
  // Ghế BE báo BOOKED nhưng chưa có trong manifest — chưa soát vé được, phân
  // biệt hẳn với "Chưa lên" (đã có vé, chỉ chờ khách lên xe).
  seatBooked: {
    backgroundColor: "rgba(41, 121, 255, 0.16)",
    borderColor: "rgba(41, 121, 255, 0.45)",
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
  // Khối tên + số điện thoại người nhận. flexShrink để chip trạng thái luôn
  // giữ đủ chỗ, tên dài thì cắt bằng "…" chứ không đẩy chip vỡ hàng.
  parcelPeopleBlock: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
  },
  parcelPeople: {
    color: c.text,
    fontFamily: Fonts.rounded,
    fontSize: 17,
    fontWeight: 700,
  },
  parcelPhone: {
    color: c.textSecondary,
    fontSize: 13,
    // Số điện thoại dạng bảng: các chữ số cùng bề rộng nên nhóm 4-3-3 thẳng
    // hàng, quét mắt lúc bấm gọi nhanh hơn.
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.3,
  },
  metaStack: {
    gap: 6,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  // Text trong metaRow phải flex:1 mới wrap trong card thay vì bị cắt ngang.
  metaTextGrow: {
    flex: 1,
  },
  // Row có text nhiều dòng: icon neo lên dòng đầu thay vì lơ lửng giữa block.
  metaRowTop: {
    alignItems: "flex-start",
  },
  metaIconTop: {
    marginTop: 2.5,
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
  evidenceButtonWrap: {
    flex: 1,
    minWidth: 180,
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
  // --- Markdown của câu trả lời trợ lý ---
  markdownStack: {
    gap: Spacing.one,
  },
  markdownHeading: {
    color: c.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
  },
  markdownBulletRow: {
    flexDirection: "row",
    gap: 6,
  },
  markdownBulletMarker: {
    color: c.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  markdownBulletText: {
    flex: 1,
    color: c.text,
    fontSize: 15,
    lineHeight: 22,
  },
  markdownBold: {
    fontWeight: "700",
  },
  markdownItalic: {
    fontStyle: "italic",
  },
  markdownCode: {
    fontFamily: Fonts.mono,
    fontSize: 13.5,
  },
  // --- Indicator "đang soạn câu trả lời" ---
  typingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 3,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: c.textSecondary,
  },
  typingLabel: {
    color: c.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 12,
    marginLeft: 4,
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
