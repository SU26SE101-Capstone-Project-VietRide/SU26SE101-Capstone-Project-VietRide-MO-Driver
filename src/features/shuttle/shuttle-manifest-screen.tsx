import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ApiError } from "@/api/client";
import type { ShuttleManifestStop } from "@/api/types";
import { EmptyCard, ErrorCard, LoadingCard } from "@/components/query-state";
import { Fonts, Spacing, type Palette } from "@/constants/theme";
import {
  ActionButton,
  MetricTile,
  OperationsScreen,
  SectionTitle,
  StatusChip,
  SurfaceCard,
} from "@/features/operations/ui";
import { useGpsBroadcast } from "@/features/tracking/use-gps-broadcast";
import { formatTimeHM } from "@/features/trips/trip-format";
import { useThemedStyles } from "@/hooks/use-theme";

import { shuttleErrorMessage } from "./shuttle-errors";
import {
  shuttleDirectionLabelOf,
  shuttleStopStatusOf,
  shuttleTripStatusOf,
} from "./shuttle-format";
import { useShuttleLifecycle, useShuttleManifest } from "./use-shuttle";

// Các trạng thái coi như "đã xử lý xong" — đủ hết thì mới cho Hoàn tất chuyến.
const RESOLVED_STOP_STATUSES = new Set(["DELIVERED", "NO_SHOW", "CANCELLED"]);

export function ShuttleManifestScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ shuttleTripId: string }>();
  const shuttleTripId =
    typeof params.shuttleTripId === "string" ? params.shuttleTripId : null;

  const manifestQuery = useShuttleManifest(shuttleTripId);
  const manifest = manifestQuery.data;
  const lifecycle = useShuttleLifecycle(shuttleTripId);

  // Phát GPS shuttle khi chuyến đang chạy và màn này đang mở (foreground).
  const shuttleRunning = manifest?.status === "IN_PROGRESS";
  const gps = useGpsBroadcast(
    shuttleTripId ? { kind: "shuttle", id: shuttleTripId } : null,
    shuttleRunning === true,
  );

  // Group đang mở form nhập lý do vắng mặt (theo pickupOrder), null = đóng.
  const [noShowOrder, setNoShowOrder] = useState<number | null>(null);
  const [noShowReason, setNoShowReason] = useState("");

  // Báo lỗi mutation bằng Alert — mọi 409 đều đã tự refetch qua onSettled.
  const mutationError =
    lifecycle.start.error ??
    lifecycle.pickup.error ??
    lifecycle.deliver.error ??
    lifecycle.noShow.error ??
    lifecycle.complete.error;

  useEffect(() => {
    const message = shuttleErrorMessage(mutationError);
    if (message) {
      Alert.alert("Không thao tác được", message);
      // Xoá error đã hiển thị để lỗi mutation kế tiếp không bị lỗi cũ che mất.
      lifecycle.start.reset();
      lifecycle.pickup.reset();
      lifecycle.deliver.reset();
      lifecycle.noShow.reset();
      lifecycle.complete.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutationError]);

  const pendingCount =
    manifest?.stops.filter(
      (stop) => !RESOLVED_STOP_STATUSES.has(stop.status),
    ).length ?? 0;
  const canComplete = manifest?.status === "IN_PROGRESS" && pendingCount === 0;

  const openDirections = (stop: ShuttleManifestStop) => {
    void Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${stop.pickupLatitude},${stop.pickupLongitude}`,
    );
  };

  const callPassenger = (stop: ShuttleManifestStop) => {
    void Linking.openURL(`tel:${stop.passengerPhone}`);
  };

  const submitNoShow = (pickupOrder: number) => {
    const reason = noShowReason.trim();
    if (!reason) {
      Alert.alert("Thiếu lý do", "Nhập lý do khách vắng mặt trước khi xác nhận.");
      return;
    }
    lifecycle.noShow.mutate({ pickupOrder, reason });
    setNoShowOrder(null);
    setNoShowReason("");
  };

  // 403/404 khi tải manifest → thông báo + quay lại (khác lỗi mạng có retry).
  const loadError = manifestQuery.error;
  const loadErrorBlocked =
    loadError instanceof ApiError &&
    (loadError.statusCode === 403 || loadError.statusCode === 404);

  const statusMeta = manifest ? shuttleTripStatusOf(manifest.status) : null;

  return (
    <OperationsScreen
      title="Chuyến trung chuyển"
      subtitle={manifest?.stationName ?? "Danh sách điểm đón"}
      onBack={() => router.back()}
      onRefresh={() => manifestQuery.refetch()}
    >
      {shuttleTripId == null ? (
        <EmptyCard
          icon="error-outline"
          message="Không tìm thấy chuyến trung chuyển."
        />
      ) : manifestQuery.isLoading ? (
        <LoadingCard label="Đang tải manifest…" />
      ) : loadErrorBlocked && !manifest ? (
        <>
          <EmptyCard
            icon="do-not-disturb"
            message={
              shuttleErrorMessage(loadError) ?? "Không truy cập được chuyến này."
            }
          />
          <ActionButton
            icon="arrow-back"
            label="Về danh sách"
            tone="secondary"
            onPress={() => router.back()}
          />
        </>
      ) : manifestQuery.isError && !manifest ? (
        <ErrorCard onRetry={() => void manifestQuery.refetch()} />
      ) : manifest && statusMeta ? (
        <>
          <SurfaceCard accent delay={0}>
            <View style={styles.headerRow}>
              <Text style={styles.stationName}>{manifest.stationName}</Text>
              <StatusChip label={statusMeta.label} tone={statusMeta.tone} />
            </View>
            <Text style={styles.directionText}>
              {shuttleDirectionLabelOf(manifest.direction)}
            </Text>
            <View style={styles.metricRow}>
              <MetricTile
                icon="schedule"
                value={formatTimeHM(manifest.scheduledDepartureTime)}
                hint="Khởi hành"
                tone="primary"
                compact
              />
              <MetricTile
                icon="flag"
                value={formatTimeHM(manifest.scheduledEndTime)}
                hint="Kết thúc dự kiến"
                tone="info"
                compact
              />
              <MetricTile
                icon="navigation"
                value={gps.shuttleEta ? `${gps.shuttleEta.etaMinutes} phút` : "—"}
                hint="Tới điểm đón kế"
                tone="primary"
                compact
              />
            </View>
            {manifest.status === "SCHEDULED" ? (
              <ActionButton
                icon="play-arrow"
                label="Bắt đầu chuyến"
                disabled={lifecycle.isBusy}
                onPress={() => lifecycle.start.mutate()}
              />
            ) : null}
            {manifest.status === "IN_PROGRESS" ? (
              <>
                <ActionButton
                  icon="check-circle"
                  label="Hoàn tất chuyến"
                  disabled={lifecycle.isBusy || !canComplete}
                  onPress={() => lifecycle.complete.mutate()}
                />
                {!canComplete ? (
                  <Text style={styles.helperText}>
                    Còn {pendingCount} điểm chưa xử lý.
                  </Text>
                ) : null}
              </>
            ) : null}
          </SurfaceCard>

          <SectionTitle
            icon="pin-drop"
            title="Điểm đón"
            subtitle={`${manifest.stops.length} điểm theo thứ tự đón`}
          />
          {manifest.stops.map((stop, index) => {
            const stopMeta = shuttleStopStatusOf(stop.status);
            const actionable = manifest.status === "IN_PROGRESS";

            return (
              <SurfaceCard
                key={`${stop.bookingId}-${stop.pickupOrder}`}
                delay={index * 40}
              >
                <View style={styles.headerRow}>
                  <Text style={styles.stopOrder}>#{stop.pickupOrder}</Text>
                  <StatusChip label={stopMeta.label} tone={stopMeta.tone} />
                </View>
                <Text style={styles.passengerName}>
                  {stop.passengerDisplayName} · {stop.passengerCount} khách
                </Text>
                <Text style={styles.addressText}>{stop.pickupAddress}</Text>

                <View style={styles.buttonRow}>
                  <ActionButton
                    small
                    tone="secondary"
                    icon="call"
                    label="Gọi"
                    onPress={() => callPassenger(stop)}
                  />
                  <ActionButton
                    small
                    tone="secondary"
                    icon="directions"
                    label="Chỉ đường"
                    onPress={() => openDirections(stop)}
                  />
                </View>

                {actionable && stop.status === "PENDING" ? (
                  <View style={styles.buttonRow}>
                    <ActionButton
                      small
                      icon="person-add"
                      label="Đã đón khách"
                      disabled={lifecycle.isBusy}
                      onPress={() => lifecycle.pickup.mutate(stop.pickupOrder)}
                    />
                    <ActionButton
                      small
                      tone="danger"
                      icon="cancel"
                      label="Khách vắng"
                      disabled={lifecycle.isBusy}
                      onPress={() =>
                        setNoShowOrder(
                          noShowOrder === stop.pickupOrder
                            ? null
                            : stop.pickupOrder,
                        )
                      }
                    />
                  </View>
                ) : null}

                {actionable && stop.status === "PICKED_UP" ? (
                  <View style={styles.buttonRow}>
                    <ActionButton
                      small
                      icon="check-circle"
                      label="Đã trả khách"
                      disabled={lifecycle.isBusy}
                      onPress={() => lifecycle.deliver.mutate(stop.pickupOrder)}
                    />
                  </View>
                ) : null}

                {actionable &&
                noShowOrder === stop.pickupOrder &&
                stop.status === "PENDING" ? (
                  <View style={styles.noShowForm}>
                    <TextInput
                      style={styles.reasonInput}
                      placeholder="Lý do khách vắng mặt…"
                      value={noShowReason}
                      onChangeText={setNoShowReason}
                      multiline
                    />
                    <ActionButton
                      small
                      tone="danger"
                      label="Xác nhận vắng mặt"
                      disabled={lifecycle.isBusy}
                      onPress={() => submitNoShow(stop.pickupOrder)}
                    />
                  </View>
                ) : null}
              </SurfaceCard>
            );
          })}
        </>
      ) : null}
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
    stationName: {
      flex: 1,
      fontFamily: Fonts.rounded,
      fontSize: 17,
      fontWeight: 700,
      color: c.text,
    },
    directionText: {
      marginTop: 4,
      fontSize: 13,
      color: c.textSecondary,
    },
    metricRow: {
      flexDirection: "row",
      gap: Spacing.two,
      marginVertical: Spacing.two,
    },
    helperText: {
      marginTop: 6,
      fontSize: 12,
      color: c.textSecondary,
      textAlign: "center",
    },
    stopOrder: {
      fontFamily: Fonts.rounded,
      fontSize: 15,
      fontWeight: 700,
      color: c.text,
    },
    passengerName: {
      marginTop: 6,
      fontSize: 14,
      fontWeight: 600,
      color: c.text,
    },
    addressText: {
      marginTop: 2,
      fontSize: 13,
      color: c.textSecondary,
    },
    buttonRow: {
      flexDirection: "row",
      gap: Spacing.two,
      marginTop: Spacing.two,
    },
    noShowForm: {
      marginTop: Spacing.two,
      gap: Spacing.two,
    },
    reasonInput: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      padding: 10,
      minHeight: 64,
      textAlignVertical: "top",
      color: c.text,
    },
  });
