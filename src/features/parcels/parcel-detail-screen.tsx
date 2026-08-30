import { useLocalSearchParams, useRouter } from "expo-router";

import { EmptyCard, ErrorCard, LoadingCard } from "@/components/query-state";
import { ParcelCard } from "@/features/operations/role-screens";
import { useSelectedTrip } from "@/features/trips/selected-trip-context";
import { OperationsScreen } from "@/features/operations/ui";
import { useAssistantTripParcels } from "@/features/parcels/use-parcels";
import { useTripDetails } from "@/features/trips/use-trips";

// Màn chi tiết một kiện, mở sau khi quét QR hoặc nhập tay mã kiện.
//
// Quét QR nghĩa là kiện đang ở trên tay và phụ xe sắp thao tác ngay — nên đưa
// hẳn sang màn riêng: nút to, không phải cuộn tìm giữa danh sách, không bấm
// nhầm sang kiện bên cạnh. Danh sách ở tab Hàng hoá chỉ còn để duyệt/tìm.
//
// Dữ liệu lấy từ CHÍNH manifest (không gọi `GET /v1/parcels/{id}`) vì chỉ
// manifest mới có `availableActions` — nguồn quyết định hiện nút nào. Truy vấn
// kèm `search=parcelCode` nên kiện nằm ở trang sau vẫn tìm ra, và dùng chung
// cache với tab Hàng hoá nên thao tác xong hai bên đồng bộ luôn.
export function ParcelDetailScreen() {
  const params = useLocalSearchParams<{
    parcelId?: string;
    parcelCode?: string;
  }>();
  const parcelId = typeof params.parcelId === "string" ? params.parcelId : null;
  const parcelCode =
    typeof params.parcelCode === "string" ? params.parcelCode : null;

  const router = useRouter();
  const activeTrip = useSelectedTrip();
  const tripId = activeTrip.tripId;

  const parcelsQuery = useAssistantTripParcels(
    tripId,
    parcelCode ? { search: parcelCode } : {},
  );
  const manifest = parcelsQuery.data;
  const parcel =
    manifest?.items.find((item) => item.parcelId === parcelId) ??
    manifest?.items.find((item) => item.parcelCode === parcelCode) ??
    null;

  const operational = manifest?.tripContext?.currentOperationalLocation ?? null;
  const stoppedHere =
    operational?.status === "ARRIVED" && operational.departedAt == null;
  const currentStopId =
    stoppedHere && operational?.location?.type === "ROUTE_STOP"
      ? operational.location.id
      : null;
  // Bến cuối KHÔNG suy từ `currentOperationalLocation` (Guide (2) §C2: "Do not
  // use currentOperationalLocation for destination-station unload"); ở bến cuối
  // trường này thường là null. Nguồn đúng là mốc `destinationArrivedAt`.
  // Màn Hàng hoá đã sửa từ trước, màn chi tiết này bị bỏ sót nên nút dỡ kiện
  // vẫn khoá kèm câu "chưa phải chỗ xe đang dừng" dù xe đã vào bến.
  const tripDetails = useTripDetails(tripId);
  const atDestination =
    tripDetails.data?.destinationArrivedAt != null ||
    (stoppedHere && operational?.location?.type === "DESTINATION_STATION");
  const destinationStationId =
    manifest?.tripContext?.trip?.route?.destination?.id ?? null;
  const originLocation = manifest?.tripContext?.trip?.route?.origin ?? null;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/assistant/cargo");
    }
  };

  return (
    <OperationsScreen
      title="Chi tiết kiện"
      subtitle={parcelCode ?? "Kiện vừa quét"}
      onBack={handleBack}
      onRefresh={() => parcelsQuery.refetch()}
    >
      {activeTrip.isLoading || (tripId && parcelsQuery.isLoading) ? (
        <LoadingCard label="Đang tải kiện…" />
      ) : parcelsQuery.isError ? (
        <ErrorCard onRetry={() => void parcelsQuery.refetch()} />
      ) : !tripId ? (
        <EmptyCard
          icon="event-busy"
          message="Chưa có chuyến đang chạy để xem kiện hàng."
        />
      ) : !parcel ? (
        <EmptyCard
          icon="inventory"
          message={`Không thấy kiện ${parcelCode ?? ""} trong chuyến này. Kiểm tra lại tem hoặc chọn đúng chuyến.`}
        />
      ) : (
        <ParcelCard
          parcel={parcel}
          tripId={tripId}
          custodyV2
          currentStopId={currentStopId}
          atDestination={Boolean(atDestination)}
          destinationStationId={destinationStationId}
          currentLocation={operational?.location ?? null}
          originLocation={originLocation}
        />
      )}
    </OperationsScreen>
  );
}
