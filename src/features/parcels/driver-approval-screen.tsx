import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";

import { useKeepInputVisible } from "@/components/keyboard-aware-scroll";
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
  custodyApprovalStatusLabel,
  incidentTypeLabel,
  locationLabel,
  recommendedActionLabel,
} from "@/features/parcels/parcel-format";
import {
  useCustodyExceptionRequest,
  useDecideCustodyException,
  useDecideStopDeparture,
  useStopDepartureApproval,
} from "@/features/parcels/use-parcels";
import { tripOpsErrorMessage } from "@/features/trip-ops/trip-ops-errors";
import { formatTimeHM } from "@/features/trips/trip-format";
import { useTheme, useThemedStyles } from "@/hooks/use-theme";

// Màn tài xế duyệt hai loại phiếu của phụ xe (Guide (2) §E2-E3 và §F3-F4):
//   - `parcelId`  → phiếu báo sự cố custody của một kiện;
//   - `requestId` → phiếu xin rời điểm khi còn kiện chưa đối soát.
// Danh tính người duyệt lấy từ JWT của tài xế, app KHÔNG gửi UUID người duyệt.
//
// LƯU Ý: backend chưa có endpoint liệt kê phiếu đang chờ (§22 gap 1, 2) nên màn
// này luôn phải được mở kèm ID — từ thông báo, hoặc từ `approvalRequestId`
// trong lỗi PARCEL_STOP_RECONCILIATION_REQUIRED khi rời điểm bị chặn.

// Chỗ cần chừa dưới ô ghi chú: hàng nút Duyệt/Từ chối (nút small ~40px) cộng
// khoảng cách trong card, để bàn phím mở ra vẫn bấm được ngay.
const DECISION_ROW_HEIGHT = 56;

export function DriverParcelApprovalScreen() {
  const params = useLocalSearchParams<{
    parcelId?: string;
    requestId?: string;
  }>();
  const parcelId = typeof params.parcelId === "string" ? params.parcelId : null;
  const requestId =
    typeof params.requestId === "string" ? params.requestId : null;

  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const [note, setNote] = useState("");
  const reserveBelowInput = useKeepInputVisible();

  const exceptionQuery = useCustodyExceptionRequest(parcelId);
  const departureQuery = useStopDepartureApproval(requestId);
  const decideException = useDecideCustodyException(parcelId);
  const decideDeparture = useDecideStopDeparture(requestId);

  const query = parcelId ? exceptionQuery : departureQuery;
  const decide = parcelId ? decideException : decideDeparture;
  const errorMessage = tripOpsErrorMessage(decide.error);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/driver/trip");
    }
  };

  // Từ chối là quyết định không hoàn tác được (backend đóng luôn phiếu) nên
  // hỏi lại một nhịp; duyệt thì gửi thẳng vì phụ xe đang chờ ngoài xe.
  const submit = (decision: "APPROVE" | "REJECT") => {
    const send = () => decide.mutate({ decision, note });
    if (decision === "APPROVE") {
      send();
      return;
    }
    Alert.alert(
      "Từ chối phiếu này?",
      "Phiếu bị từ chối sẽ đóng lại, phụ xe phải xử lý theo hướng khác. Không hoàn tác được.",
      [
        { text: "Xem lại", style: "cancel" },
        { text: "Từ chối", style: "destructive", onPress: send },
      ],
    );
  };

  if (!parcelId && !requestId) {
    return (
      <OperationsScreen
        title="Phiếu chờ duyệt"
        subtitle="Mở phiếu từ thông báo hoặc từ cảnh báo khi rời điểm."
        onBack={handleBack}
      >
        <SurfaceCard>
          <Text style={styles.hint}>
            Thiếu mã phiếu nên chưa mở được. Hệ thống chưa có danh sách phiếu chờ
            duyệt — tài xế mở phiếu từ thông báo phụ xe gửi, hoặc từ cảnh báo
            hiện ra khi rời điểm bị chặn.
          </Text>
        </SurfaceCard>
      </OperationsScreen>
    );
  }

  return (
    <OperationsScreen
      title={parcelId ? "Duyệt sự cố kiện hàng" : "Duyệt rời điểm"}
      subtitle={
        parcelId
          ? "Phụ xe báo kiện đã nằm sai vị trí, cần tài xế xác nhận."
          : "Phụ xe xin rời điểm khi còn kiện chưa đối soát."
      }
      onBack={handleBack}
      onRefresh={() => query.refetch()}
    >
      {query.isLoading ? (
        <LoadingCard label="Đang tải phiếu…" />
      ) : query.isError ? (
        <>
          <ErrorCard onRetry={() => void query.refetch()} />
          <SurfaceCard>
            <Text style={styles.hint}>
              {tripOpsErrorMessage(query.error) ??
                "Không đọc được phiếu. Có thể phiếu không thuộc chuyến của tài xế, hoặc backend chưa bật tính năng này."}
            </Text>
          </SurfaceCard>
        </>
      ) : parcelId && exceptionQuery.data ? (
        <CustodyExceptionCard data={exceptionQuery.data} />
      ) : departureQuery.data ? (
        <DepartureCard data={departureQuery.data} />
      ) : null}

      {query.data ? (
        <SurfaceCard delay={60}>
          <SectionTitle icon="gavel" title="Quyết định của tài xế" />
          {decided(query.data.status) ? (
            <Text style={styles.hint}>
              Phiếu đã được xử lý ({custodyApprovalStatusLabel(query.data.status)}
              ). Không thao tác thêm được.
            </Text>
          ) : (
            <>
              <TextInput
                placeholder="Ghi chú cho quyết định (tuỳ chọn)"
                placeholderTextColor={theme.placeholder}
                style={styles.input}
                value={note}
                onChangeText={setNote}
                // Guide (2) §E3: note tối đa 2000 ký tự.
                maxLength={2000}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                // Hàng nút Duyệt/Từ chối nằm ngay dưới ô này: đặt chỗ trước để
                // bàn phím mở ra vẫn thấy cả ô ghi chú lẫn nút bấm, khỏi phải
                // cuộn tay giữa lúc đang gõ.
                onFocus={() => reserveBelowInput(DECISION_ROW_HEIGHT)}
                onBlur={() => reserveBelowInput(0)}
              />
              {errorMessage ? (
                <Text style={styles.error}>{errorMessage}</Text>
              ) : null}
              <View style={styles.row}>
                <ActionButton
                  icon="check-circle"
                  label={decide.isPending ? "Đang gửi…" : "Duyệt"}
                  tone="primary"
                  small
                  disabled={decide.isPending}
                  onPress={() => submit("APPROVE")}
                />
                <ActionButton
                  icon="cancel"
                  label="Từ chối"
                  tone="ghost"
                  small
                  disabled={decide.isPending}
                  onPress={() => submit("REJECT")}
                />
              </View>
            </>
          )}
        </SurfaceCard>
      ) : null}
    </OperationsScreen>
  );
}

// Phiếu đã có người duyệt (kể cả operator duyệt song song) thì khoá thao tác —
// §19: gặp ALREADY_DECIDED thì đọc lại state của server, không tự đoán.
function decided(status: string | null | undefined): boolean {
  return status != null && status !== "PENDING_APPROVAL";
}

function CustodyExceptionCard({
  data,
}: {
  data: ReturnType<typeof useCustodyExceptionRequest>["data"] & object;
}) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();

  return (
    <SurfaceCard accent>
      <SectionTitle
        icon="report-problem"
        title={incidentTypeLabel(data.incidentType)}
        subtitle={`Phụ xe báo lúc ${formatTimeHM(data.reportedAt)}`}
      />
      <View style={styles.stack}>
        <StatusChip
          label={custodyApprovalStatusLabel(data.status)}
          tone={data.status === "PENDING_APPROVAL" ? "warning" : "neutral"}
        />
        <Row icon="place" theme={theme}>
          Vị trí thực tế:{" "}
          {locationLabel({
            type: data.actualLocationType,
            name: data.locationSnapshot,
          })}
        </Row>
        <Row icon="notes" theme={theme}>
          Lý do: {data.reason}
        </Row>
        {data.description ? (
          <Row icon="description" theme={theme}>
            {data.description}
          </Row>
        ) : null}
        {data.observedWeightKg != null ? (
          <Row icon="scale" theme={theme}>
            Cân tại chỗ: {data.observedWeightKg}kg
          </Row>
        ) : null}
        {data.temporaryExceptionTag ? (
          <Row icon="label" theme={theme}>
            Thẻ tạm: {data.temporaryExceptionTag}
          </Row>
        ) : null}
        {/* §E1: chờ duyệt thì CHƯA có hạn tìm kiếm — không được bịa SLA 72h. */}
        {data.searchDeadline ? (
          <Row icon="schedule" theme={theme}>
            Hạn tìm kiếm: {formatTimeHM(data.searchDeadline)}
          </Row>
        ) : (
          <Text style={styles.hint}>
            Chưa duyệt nên hệ thống chưa mở phiếu tìm kiếm. Duyệt xong mới bắt
            đầu tìm và mới ghi nhận kiện đã rời xe.
          </Text>
        )}
      </View>
    </SurfaceCard>
  );
}

function DepartureCard({
  data,
}: {
  data: ReturnType<typeof useStopDepartureApproval>["data"] & object;
}) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const count = data.unresolvedParcelIds?.length ?? 0;

  return (
    <SurfaceCard accent>
      <SectionTitle
        icon="fact-check"
        title="Xin rời điểm khi còn thiếu kiện"
        subtitle={
          data.requestedAt
            ? `Phụ xe gửi lúc ${formatTimeHM(data.requestedAt)}`
            : "Phụ xe vừa gửi"
        }
      />
      <View style={styles.stack}>
        <StatusChip
          label={custodyApprovalStatusLabel(data.status)}
          tone={data.status === "PENDING_APPROVAL" ? "warning" : "neutral"}
        />
        <Row icon="inventory-2" theme={theme}>
          {count > 0
            ? `${count} kiện chưa đối soát tại điểm này`
            : "Không còn kiện nào chưa đối soát"}
        </Row>
        {data.departureOverrideReason ? (
          <Row icon="notes" theme={theme}>
            Lý do: {data.departureOverrideReason}
          </Row>
        ) : null}
        <Text style={styles.hint}>
          {recommendedActionLabel("SEARCH_VEHICLE_OR_STATION")} Duyệt nghĩa là
          xe được rời điểm dù kiện chưa tìm thấy, việc tìm kiếm tiếp tục ở bến.
        </Text>
      </View>
    </SurfaceCard>
  );
}

function Row({
  children,
  icon,
  theme,
}: {
  children: React.ReactNode;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  theme: Palette;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      <MaterialIcons name={icon} size={15} color={theme.textSecondary} />
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    stack: {
      gap: Spacing.two,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
    },
    text: {
      color: c.textSecondary,
      flex: 1,
      fontSize: 13,
      lineHeight: 19,
    },
    hint: {
      color: c.textSecondary,
      fontFamily: Fonts.rounded,
      fontSize: 12,
      lineHeight: 18,
    },
    error: {
      color: c.danger,
      fontSize: 13,
      lineHeight: 19,
    },
    input: {
      backgroundColor: c.backgroundElement,
      borderColor: c.border,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      color: c.text,
      minHeight: 44,
      paddingHorizontal: Spacing.three,
      paddingVertical: Spacing.two,
    },
  });
