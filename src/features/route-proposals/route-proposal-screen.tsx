import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { AlternativeRoute, RouteChangeProposal } from "@/api/types";
import { EmptyCard, ErrorCard, LoadingCard } from "@/components/query-state";
import { Spacing, type Palette } from "@/constants/theme";
import {
  ActionButton,
  OperationsScreen,
  SectionTitle,
  StatusChip,
  SurfaceCard,
} from "@/features/operations/ui";
import { normalizeTripStatus } from "@/features/trips/trip-format";
import { useActiveTrip } from "@/features/trips/use-trips";
import { useTheme, useThemedStyles } from "@/hooks/use-theme";

import { AlternativeRouteMap } from "./alternative-route-map";
import {
  formatDistanceKm,
  formatDurationMinutes,
  proposalStatusMeta,
  resolutionCodeText,
} from "./proposal-format";
import { routeProposalErrorMessage } from "./route-proposal-errors";
import {
  useAlternativeRoutes,
  useSubmitRouteChangeProposal,
  useTripRouteProposals,
} from "./use-route-proposals";

const REASON_MAX_LENGTH = 500;

// Backend chỉ nhận đề xuất khi chuyến ở ba trạng thái này (doc mục 6.2).
const EDITABLE_STATUSES = ["SCHEDULED", "BOARDING", "IN_PROGRESS"];

export function RouteProposalScreen() {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const router = useRouter();

  const activeTrip = useActiveTrip();
  const tripId = activeTrip.trip?.tripId ?? null;

  const routesQuery = useAlternativeRoutes(tripId);
  const proposalsQuery = useTripRouteProposals(tripId);
  const submission = useSubmitRouteChangeProposal(tripId);

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const tripEditable = EDITABLE_STATUSES.includes(
    normalizeTripStatus(activeTrip.trip?.status),
  );

  // Memo hoá vì `?? []` tạo mảng mới mỗi render, làm useMemo tìm tuyến bên dưới
  // chạy lại vô ích.
  const routes = useMemo(
    () => routesQuery.data?.items ?? [],
    [routesQuery.data],
  );
  const proposals = proposalsQuery.data?.items ?? [];
  const trimmedReason = reason.trim();
  const errorMessage = routeProposalErrorMessage(submission.error);

  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId) ?? null,
    [routes, selectedRouteId],
  );

  // Nói rõ vì sao chưa gửi được, đặt ngay trên nút thay vì để nút mờ không lý do.
  const blockedReason = !tripId
    ? "Chưa có chuyến nào đang chạy để đề xuất đổi tuyến."
    : !tripEditable
      ? "Chuyến không còn ở trạng thái cho phép đổi tuyến."
      : !selectedRouteId
        ? "Chọn một tuyến thay thế trước khi gửi."
        : trimmedReason.length === 0
          ? "Nhập lý do đổi tuyến để điều hành hiểu tình huống."
          : null;

  // Đổi tuyến hoặc sửa lý do là đổi nội dung đề xuất → khoá chống trùng cũ không
  // dùng lại được nữa.
  const selectRoute = (routeId: string) => {
    setSelectedRouteId(routeId);
    submission.resetKey();
    submission.reset();
  };

  const changeReason = (value: string) => {
    setReason(value);
    submission.resetKey();
  };

  const send = () => {
    if (!tripId || !selectedRouteId || trimmedReason.length === 0) {
      return;
    }

    submission.submit(
      {
        type: "EXISTING",
        alternativeRouteId: selectedRouteId,
        incidentId: null,
        reason: trimmedReason,
      },
      {
        onSuccess: () => {
          setSelectedRouteId(null);
          setReason("");
        },
      },
    );
  };

  // Chốt lại trước khi gửi: điều hành nhận ngay và app không có nút thu hồi.
  const confirmAndSend = () => {
    if (blockedReason || !selectedRoute) {
      return;
    }

    Alert.alert(
      `Đề xuất đổi sang "${selectedRoute.name}"?`,
      "Điều hành nhận được ngay. Gửi rồi thì không tự rút lại được.",
      [
        { text: "Xem lại", style: "cancel" },
        { text: "Gửi đề xuất", onPress: send },
      ],
    );
  };

  return (
    <OperationsScreen
      title="Đề xuất đổi tuyến"
      subtitle="Chọn tuyến thay thế nhà xe đã cấu hình và gửi lý do."
      onBack={() => router.back()}
      onRefresh={() =>
        Promise.all([
          activeTrip.refetch(),
          ...(tripId ? [routesQuery.refetch(), proposalsQuery.refetch()] : []),
        ])
      }
    >
      {activeTrip.isLoading ? (
        <LoadingCard label="Đang tải chuyến…" />
      ) : !tripId ? (
        <EmptyCard
          icon="event-busy"
          message="Bạn không có chuyến nào đang chạy hoặc sắp khởi hành."
        />
      ) : (
        <>
          {!tripEditable ? (
            <SurfaceCard accent delay={0}>
              <SectionTitle
                icon="info"
                title="Không đổi tuyến được nữa"
                subtitle="Chuyến đã kết thúc hoặc bị hủy. Bên dưới là các đề xuất đã gửi."
              />
            </SurfaceCard>
          ) : null}

          {tripEditable ? (
            <SurfaceCard delay={0}>
              <SectionTitle
                icon="alt-route"
                title="Chọn tuyến thay thế"
                subtitle="Chỉ hiện tuyến nhà xe đã cấu hình sẵn cho tuyến chính."
              />

              {routesQuery.isLoading ? (
                <Text style={styles.metaText}>Đang tải tuyến thay thế…</Text>
              ) : routesQuery.isError ? (
                <ActionButton
                  icon="refresh"
                  label="Tải lại danh sách tuyến"
                  tone="secondary"
                  onPress={() => void routesQuery.refetch()}
                />
              ) : routes.length === 0 ? (
                <Text style={styles.metaText}>
                  Nhà xe chưa cấu hình tuyến thay thế nào cho chuyến này. Báo
                  điều hành qua mục Báo sự cố nhé.
                </Text>
              ) : (
                routes.map((route) => (
                  <AlternativeRouteOption
                    key={route.id}
                    route={route}
                    tripId={tripId}
                    selected={route.id === selectedRouteId}
                    onSelect={() => selectRoute(route.id)}
                  />
                ))
              )}

              {routes.length > 0 ? (
                <>
                  <Text style={styles.fieldLabel}>Lý do đổi tuyến</Text>
                  <TextInput
                    style={styles.reasonInput}
                    multiline
                    maxLength={REASON_MAX_LENGTH}
                    placeholder="Ví dụ: Đường chính đang bị phong tỏa."
                    placeholderTextColor={theme.textMeta}
                    value={reason}
                    onChangeText={changeReason}
                  />
                  <Text style={styles.counterText}>
                    {trimmedReason.length}/{REASON_MAX_LENGTH} ký tự
                  </Text>

                  {errorMessage ? (
                    <Text style={styles.errorText}>{errorMessage}</Text>
                  ) : null}

                  {blockedReason ? (
                    <Text style={styles.metaText}>{blockedReason}</Text>
                  ) : null}

                  <ActionButton
                    icon="send"
                    label={
                      submission.isPending
                        ? "Đang gửi…"
                        : submission.isRetry
                          ? "Thử gửi lại"
                          : "Gửi đề xuất"
                    }
                    tone="primary"
                    disabled={blockedReason != null || submission.isPending}
                    onPress={confirmAndSend}
                  />
                </>
              ) : null}
            </SurfaceCard>
          ) : null}

          <SurfaceCard delay={20}>
            <SectionTitle
              icon="history"
              title="Đề xuất đã gửi"
              subtitle="Tự cập nhật khi điều hành xử lý."
            />

            {proposalsQuery.isLoading ? (
              <Text style={styles.metaText}>Đang tải đề xuất…</Text>
            ) : proposalsQuery.isError ? (
              <ErrorCard onRetry={() => void proposalsQuery.refetch()} />
            ) : proposals.length === 0 ? (
              <Text style={styles.metaText}>
                Chuyến này chưa có đề xuất đổi tuyến nào.
              </Text>
            ) : (
              <>
                {proposals.map((proposal) => (
                  <ProposalRow key={proposal.id} proposal={proposal} />
                ))}
                {/* Không dựng UI phân trang, nhưng phải nói rõ đang cắt bớt
                    thay vì âm thầm giấu bớt đề xuất cũ. */}
                {(proposalsQuery.data?.totalItems ?? 0) > proposals.length ? (
                  <Text style={styles.metaText}>
                    Chỉ hiện {proposals.length} đề xuất gần nhất.
                  </Text>
                ) : null}
              </>
            )}
          </SurfaceCard>
        </>
      )}
    </OperationsScreen>
  );
}

function AlternativeRouteOption({
  onSelect,
  route,
  selected,
  tripId,
}: {
  onSelect: () => void;
  route: AlternativeRoute;
  selected: boolean;
  tripId: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={[styles.routeOption, selected && styles.routeOptionSelected]}
    >
      <View style={styles.routeOptionHeader}>
        <MaterialIcons
          name={selected ? "radio-button-checked" : "radio-button-unchecked"}
          size={20}
          color={selected ? theme.primary : theme.textMeta}
        />
        <Text style={styles.routeOptionName} numberOfLines={2}>
          {route.name}
        </Text>
      </View>

      {route.description ? (
        <Text style={styles.metaText}>{route.description}</Text>
      ) : null}

      <Text style={styles.metaText}>
        {formatDistanceKm(route.totalDistanceKm)} ·{" "}
        {formatDurationMinutes(route.estimatedDurationMinutes)} ·{" "}
        {route.stops.length} điểm dừng
      </Text>

      <AlternativeRouteMap tripId={tripId} pathPolyline={route.pathPolyline} />
    </Pressable>
  );
}

function ProposalRow({ proposal }: { proposal: RouteChangeProposal }) {
  const styles = useThemedStyles(makeStyles);
  const statusMeta = proposalStatusMeta(proposal.status);
  const resolution = resolutionCodeText(proposal.resolutionCode);

  return (
    <View style={styles.proposalRow}>
      <View style={styles.proposalHeader}>
        <Text style={styles.proposalName} numberOfLines={2}>
          {proposal.snapshot.name}
        </Text>
        <StatusChip label={statusMeta.label} tone={statusMeta.tone} />
      </View>

      <Text style={styles.metaText}>Lý do: {proposal.reason}</Text>

      {proposal.status === "APPROVED" ? (
        <Text style={styles.metaText}>Đã duyệt và áp dụng cho chuyến.</Text>
      ) : null}

      {proposal.status === "REJECTED" && proposal.rejectionReason ? (
        <Text style={styles.metaText}>
          Điều hành từ chối: {proposal.rejectionReason}
        </Text>
      ) : null}

      {resolution ? <Text style={styles.metaText}>{resolution}</Text> : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    counterText: {
      color: c.textMeta,
      fontSize: 12,
      textAlign: "right",
    },
    errorText: {
      color: c.tones.danger.text,
      fontSize: 13,
      lineHeight: 18,
    },
    fieldLabel: {
      color: c.text,
      fontSize: 14,
      fontWeight: "600",
      marginTop: Spacing.two,
    },
    metaText: {
      color: c.textMeta,
      fontSize: 13,
      lineHeight: 18,
    },
    proposalHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: Spacing.two,
      justifyContent: "space-between",
    },
    proposalName: {
      color: c.text,
      flex: 1,
      fontSize: 15,
      fontWeight: "600",
    },
    proposalRow: {
      borderTopColor: c.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: Spacing.one,
      paddingVertical: Spacing.two,
    },
    reasonInput: {
      backgroundColor: c.backgroundElement,
      borderColor: c.border,
      borderRadius: 12,
      borderWidth: 1,
      color: c.text,
      fontSize: 14,
      minHeight: 88,
      padding: Spacing.three,
      textAlignVertical: "top",
    },
    routeOption: {
      borderColor: c.border,
      borderRadius: 12,
      borderWidth: 1,
      gap: Spacing.two,
      padding: Spacing.three,
    },
    routeOptionHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: Spacing.two,
    },
    routeOptionName: {
      color: c.text,
      flex: 1,
      fontSize: 15,
      fontWeight: "600",
    },
    routeOptionSelected: {
      backgroundColor: c.backgroundSelected,
      borderColor: c.primary,
    },
  });
