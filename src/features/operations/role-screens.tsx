import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState, type ComponentProps } from "react";
import {
    Linking,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import { ApiError } from "@/api/client";
import { streamRagChat } from "@/api/rag";
import type { SeatCell, TripDetails } from "@/api/types";
import { EmptyCard, ErrorCard, LoadingCard } from "@/components/query-state";
import { Fonts, Spacing, type Palette } from "@/constants/theme";
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
import {
    SUPPORT_QUICK_PROMPTS,
    useOperations,
} from "@/features/operations/operations-context";
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
import { useAuthenticatedSession } from "@/features/session/session-context";
import { useTheme, useThemedStyles } from "@/hooks/use-theme";

const INCIDENT_CATEGORIES = [
  "TRAFFIC_JAM",
  "VEHICLE_BREAKDOWN",
  "ACCIDENT",
  "WEATHER",
  "OTHER",
] as const;

const INCIDENT_CATEGORY_META: Record<
  (typeof INCIDENT_CATEGORIES)[number],
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

  return (
    <OperationsScreen
      title="Lịch làm việc"
      subtitle={displayName}
      headerRight={<NotificationBell />}
    >
      <WorkScheduleSection onOpenActive={() => router.push("/driver/trip")} />
    </OperationsScreen>
  );
}

export function AssistantOverviewScreen() {
  const router = useRouter();
  const { displayName } = useAuthenticatedSession();

  return (
    <OperationsScreen
      title="Lịch làm việc"
      subtitle={displayName}
      headerRight={<NotificationBell />}
    >
      <WorkScheduleSection
        onOpenActive={() => router.push("/assistant/boarding")}
      />
    </OperationsScreen>
  );
}

export function DriverTripScreen() {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const activeTrip = useActiveTrip();
  const detailsQuery = useTripDetails(activeTrip.trip?.tripId ?? null);
  const details = detailsQuery.data;

  const statusMeta = tripStatusMeta(activeTrip.trip?.status);
  // Điểm dừng kế tiếp = stop có ETA gần nhất còn ở tương lai.
  // Chốt "bây giờ" theo lần data đổi để không gọi impure Date.now() khi render.
  const now = useMemo(() => new Date().getTime(), []);
  const nextStop = details?.stops
    .filter((stop) => new Date(stop.estimatedArrivalTime).getTime() > now)
    .sort((a, b) => a.orderIndex - b.orderIndex)[0];

  return (
    <OperationsScreen
      title="Chuyến đang chạy"
      subtitle={details?.originStation?.name ?? "Chuyến của bạn hôm nay"}
      headerRight={<NotificationBell />}
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
            <View style={styles.routeSummary}>
              <View style={styles.routeEndpoint}>
                <Text style={styles.routeEndpointLabel}>Điểm đi</Text>
                <Text style={styles.routeEndpointName} numberOfLines={2}>
                  {details.originStation?.name ?? "—"}
                </Text>
              </View>
              <MaterialIcons
                name="arrow-forward"
                size={22}
                color={theme.primary}
              />
              <View style={styles.routeEndpoint}>
                <Text style={styles.routeEndpointLabel}>Điểm đến</Text>
                <Text style={styles.routeEndpointName} numberOfLines={2}>
                  {details.destinationStation?.name ?? "—"}
                </Text>
              </View>
            </View>

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

          <TripStopsCard
            details={details}
            nextStopId={nextStop?.stopId ?? null}
          />
        </>
      ) : null}
    </OperationsScreen>
  );
}

const MAX_INCIDENT_PHOTOS = 3;

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
  const { currentStop } = useOperations();
  const [incidentCategory, setIncidentCategory] =
    useState<(typeof INCIDENT_CATEGORIES)[number]>("TRAFFIC_JAM");
  const [incidentDescription, setIncidentDescription] = useState("");
  const [photoCount, setPhotoCount] = useState(0);
  const [incidentSubmitted, setIncidentSubmitted] = useState(false);

  return (
    <OperationsScreen
      title="Báo sự cố"
      subtitle={subtitle}
      onBack={onBack}
      headerRight={<NotificationBell />}
    >
      <SurfaceCard accent delay={0}>
        <SectionTitle
          icon="location-on"
          title="Vị trí hiện tại"
          subtitle={`${currentStop.name} • ${currentStop.zone}`}
        />
        <Text style={styles.metaText}>
          Báo cáo sẽ tự động đính kèm vị trí và thông tin chuyến.
        </Text>
      </SurfaceCard>

      <SurfaceCard delay={120}>
        <SectionTitle icon="warning-amber" title="Loại sự cố" />

        <View style={styles.categoryWrap}>
          {INCIDENT_CATEGORIES.map((category) => (
            <ActionButton
              key={category}
              icon={INCIDENT_CATEGORY_META[category].icon}
              label={INCIDENT_CATEGORY_META[category].label}
              tone={incidentCategory === category ? "danger" : "secondary"}
              small
              onPress={() => setIncidentCategory(category)}
            />
          ))}
        </View>

        <TextInput
          multiline
          numberOfLines={4}
          maxLength={500}
          placeholder="Mô tả nhanh tình huống (tối đa 500 ký tự)."
          placeholderTextColor={theme.placeholder}
          style={styles.input}
          value={incidentDescription}
          onChangeText={setIncidentDescription}
        />

        <View style={styles.actionRow}>
          <ActionButton
            icon="photo-camera"
            label={`Đính kèm ảnh (${photoCount}/${MAX_INCIDENT_PHOTOS})`}
            tone="secondary"
            disabled={photoCount >= MAX_INCIDENT_PHOTOS}
            onPress={() =>
              setPhotoCount((current) =>
                Math.min(current + 1, MAX_INCIDENT_PHOTOS),
              )
            }
          />
          {photoCount > 0 ? (
            <ActionButton
              icon="delete"
              label="Xóa ảnh"
              tone="ghost"
              onPress={() => setPhotoCount(0)}
            />
          ) : null}
        </View>

        <ActionButton
          icon="send"
          label="Gửi báo cáo"
          tone="danger"
          onPress={() => setIncidentSubmitted(true)}
        />

        {incidentSubmitted ? (
          <View style={styles.scanBanner}>
            <StatusChip label="Đã gửi báo cáo" tone="success" />
            <Text style={styles.feedbackText}>
              Đã ghi nhận: {INCIDENT_CATEGORY_META[incidentCategory].label} •{" "}
              {photoCount} ảnh • vị trí {currentStop.shortName}.
            </Text>
          </View>
        ) : null}
      </SurfaceCard>
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
      headerRight={<NotificationBell />}
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
              subtitle="Nhập mã booking trên vé QR của khách."
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
        const maxCol = Math.max(...deckSeats.map((seat) => seat.col));

        return (
          <View key={`deck-${deck}`} style={styles.seatGrid}>
            {decks.length > 1 ? (
              <Text style={styles.metaText}>Tầng {deck}</Text>
            ) : null}
            {rows.map((row) => (
              <View key={`row-${deck}-${row}`} style={styles.seatRow}>
                {Array.from({ length: maxCol + 1 }, (_, col) => {
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
  const {
    advanceParcelStatus,
    cargoMetrics,
    parcels,
    settleAdditionalPayment,
    weighParcel,
  } = useOperations();

  return (
    <OperationsScreen
      title="Hàng ký gửi"
      subtitle="Nhận, dỡ và giao kiện hàng."
      headerRight={<NotificationBell />}
    >
      <SurfaceCard accent delay={0}>
        <View style={styles.metricRow}>
          <MetricTile
            icon="inventory-2"
            value={String(cargoMetrics.loaded)}
            hint="Đã nhận"
            tone="success"
            compact
          />
          <MetricTile
            icon="file-download"
            value={String(cargoMetrics.unloadNext)}
            hint="Chờ dỡ"
            tone="warning"
            compact
          />
          <MetricTile
            icon="scale"
            value={`${cargoMetrics.capacityPct}%`}
            hint="Tải trọng"
            tone={cargoMetrics.capacityTone}
            compact
          />
        </View>

        {cargoMetrics.nearCapacity ? (
          <View style={styles.feedbackBanner}>
            <StatusChip label="Khoang gần đầy ≥80%" tone="danger" />
            <Text style={styles.feedbackText}>
              {cargoMetrics.onBoardWeightKg}/{cargoMetrics.maxCargoWeightKg}kg —
              cân nhắc trước khi nhận thêm.
            </Text>
          </View>
        ) : null}
      </SurfaceCard>

      <SurfaceCard delay={120}>
        <SectionTitle icon="inventory" title="Danh sách kiện" />

        <View style={styles.listStack}>
          {parcels.map((parcel) => (
            <ParcelCard
              key={parcel.id}
              parcel={parcel}
              onWeigh={weighParcel}
              onSettleAdditional={settleAdditionalPayment}
              onAdvance={advanceParcelStatus}
            />
          ))}
        </View>
      </SurfaceCard>
    </OperationsScreen>
  );
}

const MAX_DELIVERY_PHOTOS = 3;

function ParcelCard({
  onAdvance,
  onSettleAdditional,
  onWeigh,
  parcel,
}: {
  onAdvance: (parcelId: string) => void;
  onSettleAdditional: (parcelId: string) => void;
  onWeigh: (parcelId: string, actualWeightKg: number) => void;
  parcel: ReturnType<typeof useOperations>["parcels"][number];
}) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const [weightDraft, setWeightDraft] = useState("");
  const [receiveScanned, setReceiveScanned] = useState(false);
  const [deliveryScanned, setDeliveryScanned] = useState(false);
  const [deliveryPhotoCount, setDeliveryPhotoCount] = useState(0);
  const parsedWeight = Number(weightDraft.replace(",", "."));
  const weightValid = Number.isFinite(parsedWeight) && parsedWeight > 0;
  const isDeliveryStep = parcel.status === "UNLOADED";
  const deliveryReady = deliveryScanned && deliveryPhotoCount > 0;

  return (
    <View style={styles.parcelCard}>
      <View style={styles.parcelHeader}>
        <View style={styles.parcelTitleStack}>
          <Text style={styles.parcelCode}>{parcel.code}</Text>
          <Text style={styles.parcelPeople}>
            {parcel.senderName} → {parcel.recipientName}
          </Text>
        </View>
        <StatusChip label={parcel.statusLabel} tone={parcel.tone} />
      </View>

      <View style={styles.metaStack}>
        <View style={styles.metaRow}>
          <MaterialIcons name="place" size={15} color={theme.textSecondary} />
          <Text style={styles.metaText}>
            {parcel.pickupStopName} → {parcel.dropoffStopName}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <MaterialIcons name="scale" size={15} color={theme.textSecondary} />
          <Text style={styles.metaText}>
            {parcel.estimatedWeightKg}kg
            {parcel.actualWeightKg != null
              ? ` → ${parcel.actualWeightKg}kg`
              : ""}
          </Text>
        </View>
      </View>

      {parcel.needsWeighing ? (
        <View style={styles.weighStack}>
          {receiveScanned ? (
            <StatusChip
              label={`Đã quét QR ${parcel.scanCode}`}
              tone="success"
            />
          ) : (
            <ActionButton
              label="Quét QR nhận kiện"
              tone="secondary"
              small
              onPress={() => setReceiveScanned(true)}
            />
          )}
          <TextInput
            editable={receiveScanned}
            keyboardType="decimal-pad"
            placeholder={`kg thực tế (ước lượng ${parcel.estimatedWeightKg}kg)`}
            placeholderTextColor={theme.placeholder}
            style={styles.weighInput}
            value={weightDraft}
            onChangeText={setWeightDraft}
          />
          <ActionButton
            label="Cân & nhận lên"
            tone="primary"
            small
            disabled={!receiveScanned || !weightValid}
            onPress={() => {
              onWeigh(parcel.id, parsedWeight);
              setWeightDraft("");
            }}
          />
        </View>
      ) : parcel.awaitingAdditionalPayment ? (
        <View style={styles.weighStack}>
          <Text style={styles.parcelHint}>
            Vượt ước lượng — thu phụ phí trước khi nhận.
          </Text>
          <ActionButton
            label="Đã thu phụ phí → nhận lên"
            tone="primary"
            small
            onPress={() => onSettleAdditional(parcel.id)}
          />
        </View>
      ) : isDeliveryStep ? (
        <View style={styles.weighStack}>
          {deliveryScanned ? (
            <StatusChip label="Đã quét QR người nhận" tone="success" />
          ) : (
            <ActionButton
              label="Quét QR người nhận"
              tone="secondary"
              small
              onPress={() => setDeliveryScanned(true)}
            />
          )}
          <ActionButton
            label={`Chụp ảnh giao hàng (${deliveryPhotoCount}/${MAX_DELIVERY_PHOTOS})`}
            tone="secondary"
            small
            disabled={deliveryPhotoCount >= MAX_DELIVERY_PHOTOS}
            onPress={() =>
              setDeliveryPhotoCount((current) =>
                Math.min(current + 1, MAX_DELIVERY_PHOTOS),
              )
            }
          />
          <ActionButton
            label={parcel.nextActionLabel ?? "Xác nhận giao hàng"}
            tone="primary"
            small
            disabled={parcel.nextActionDisabled || !deliveryReady}
            onPress={() => onAdvance(parcel.id)}
          />
          {!deliveryReady ? (
            <Text style={styles.parcelHint}>
              Cần quét QR người nhận và tối thiểu 1 ảnh bằng chứng.
            </Text>
          ) : null}
        </View>
      ) : parcel.nextActionLabel ? (
        <View style={styles.parcelActionStack}>
          <ActionButton
            label={parcel.nextActionLabel}
            tone="primary"
            small
            disabled={parcel.nextActionDisabled}
            onPress={() => onAdvance(parcel.id)}
          />
          {parcel.nextActionHint ? (
            <Text style={styles.parcelHint}>{parcel.nextActionHint}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function AssistantStopsScreen() {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const {
    cargoMetrics,
    currentStop,
    currentStopArrived,
    markCurrentStopArrived,
    nextStop,
    pendingAtCurrentStopCount,
    routeStops,
    trip,
  } = useOperations();

  const stopActionLabel = currentStopArrived
    ? "Đã ghi nhận điểm dừng"
    : `Đã đến ${currentStop.shortName}`;

  return (
    <OperationsScreen
      title="Điểm dừng và giờ đến"
      subtitle={trip.vehicleLabel}
      headerRight={<NotificationBell />}
    >
      <SurfaceCard accent delay={0}>
        <View style={styles.routeSummary}>
          <View style={styles.routeEndpoint}>
            <Text style={styles.routeEndpointLabel}>Điểm đi</Text>
            <Text style={styles.routeEndpointName} numberOfLines={2}>
              {routeStops[0].name}
            </Text>
          </View>
          <MaterialIcons name="arrow-forward" size={22} color={theme.primary} />
          <View style={styles.routeEndpoint}>
            <Text style={styles.routeEndpointLabel}>Điểm đến</Text>
            <Text style={styles.routeEndpointName} numberOfLines={2}>
              {routeStops[routeStops.length - 1].name}
            </Text>
          </View>
        </View>

        <View style={styles.metricRow}>
          <MetricTile
            icon="my-location"
            value={currentStop.shortName}
            hint="Hiện tại"
            tone="warning"
            compact
          />
          <MetricTile
            icon="navigation"
            value={nextStop.shortName}
            hint={`Đến sau ${trip.nextStopEta}`}
            tone="primary"
            compact
          />
        </View>

        <View style={styles.metricRow}>
          <MetricTile
            icon="groups"
            value={String(pendingAtCurrentStopCount)}
            hint="Chờ lên"
            tone={pendingAtCurrentStopCount > 0 ? "warning" : "success"}
            compact
          />
          <MetricTile
            icon="file-download"
            value={String(cargoMetrics.unloadNext)}
            hint="Chờ dỡ"
            tone="info"
            compact
          />
        </View>
      </SurfaceCard>

      <RouteStopsCard routeStops={routeStops} />

      <SurfaceCard delay={180}>
        <SectionTitle icon="task-alt" title="Tác vụ tại điểm" />

        <View style={styles.actionRow}>
          <ActionButton
            label="Mở đón khách"
            tone="secondary"
            onPress={() => undefined}
          />
          <ActionButton
            label={stopActionLabel}
            tone={currentStopArrived ? "ghost" : "primary"}
            disabled={trip.status !== "IN_PROGRESS" || currentStopArrived}
            onPress={markCurrentStopArrived}
          />
        </View>
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

  return (
    <OperationsScreen
      title="Hỗ trợ vận hành"
      subtitle={`Trợ giúp cho ${roleLabel}`}
      headerRight={<NotificationBell />}
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
    const routeName =
      details?.originStation?.name && details?.destinationStation?.name
        ? `${details.originStation.name} → ${details.destinationStation.name}`
        : "Đang tải tuyến…";

    return {
      id: trip.tripId,
      date: isoDateOf(new Date(trip.departureDateTime)),
      routeName,
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
                    <Text style={styles.scheduleRoute}>{entry.routeName}</Text>
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

// Tiến trình tuyến từ API. Gap backend: stop chỉ có id + ETA, không có tên
// → hiển thị "Điểm dừng {orderIndex}" kèm giờ và loại đón/trả.
function TripStopsCard({
  details,
  nextStopId,
}: {
  details: TripDetails;
  nextStopId: string | null;
}) {
  const styles = useThemedStyles(makeStyles);
  const stops = [...details.stops].sort((a, b) => a.orderIndex - b.orderIndex);
  // Chốt "bây giờ" theo details để render thuần (không gọi Date.now() trực tiếp).
  const now = useMemo(() => new Date().getTime(), []);

  return (
    <SurfaceCard delay={120}>
      <SectionTitle icon="route" title="Tiến trình tuyến" />

      <View style={styles.stopStack}>
        {stops.map((stop) => {
          const arrived =
            new Date(stop.estimatedArrivalTime).getTime() <= now;
          const isNext = stop.stopId === nextStopId;

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
                      Điểm dừng {stop.orderIndex}
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
                    label={isNext ? "Kế tiếp" : arrived ? "Đã qua" : "Sắp tới"}
                    tone={isNext ? "warning" : arrived ? "success" : "neutral"}
                  />
                </View>
                <Text style={styles.stopMeta}>
                  Dự kiến {formatTimeHM(stop.estimatedArrivalTime)}
                  {stop.distanceFromOriginKm != null
                    ? ` • km ${stop.distanceFromOriginKm}`
                    : ""}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </SurfaceCard>
  );
}

function RouteStopsCard({
  routeStops,
}: {
  routeStops: ReturnType<typeof useOperations>["routeStops"];
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <SurfaceCard delay={120}>
      <SectionTitle icon="route" title="Tiến trình tuyến" />

      <View style={styles.stopStack}>
        {routeStops.map((stop) => (
          <View key={stop.id} style={styles.stopRow}>
            <View style={styles.stopMarkerColumn}>
              <View
                style={[
                  styles.stopMarker,
                  stop.stage === "COMPLETED" && styles.stopMarkerCompleted,
                  stop.stage === "CURRENT" && styles.stopMarkerCurrent,
                ]}
              />
              <View
                style={
                  stop.stage === "UPCOMING"
                    ? styles.stopLine
                    : styles.stopLineActive
                }
              />
            </View>

            <View style={styles.stopContent}>
              <View style={styles.stopHeader}>
                <View style={styles.stopNameBlock}>
                  <Text style={styles.stopTitle}>{stop.name}</Text>
                  <Text style={styles.stopSubtitle}>{stop.zone}</Text>
                </View>
                <StatusChip label={stop.statusLabel} tone={stop.tone} />
              </View>
              <Text style={styles.stopMeta}>{stop.timeLabel}</Text>
              {stop.note ? (
                <Text style={styles.stopNote}>{stop.note}</Text>
              ) : null}
            </View>
          </View>
        ))}
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
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
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
    backgroundColor: "rgba(148, 163, 174, 0.08)",
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
    width: 5,
    height: 5,
    borderRadius: 999,
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
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
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
  parcelHint: {
    color: "#FFD600",
    fontSize: 13,
    lineHeight: 18,
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
    backgroundColor: c.surface,
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
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: c.surfaceDeep,
    borderWidth: 1,
    borderColor: c.border,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: c.tones.primary.background,
    borderWidth: 1,
    borderColor: c.tones.primary.border,
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
    backgroundColor: "rgba(148, 163, 174, 0.1)",
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
