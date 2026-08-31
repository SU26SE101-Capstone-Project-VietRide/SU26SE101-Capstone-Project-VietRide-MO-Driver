import type { QueryClient } from "@tanstack/react-query";

// Làm mới cache sau mỗi bước vòng đời chuyến — FE-PCL-005.
//
// Bản E2E production 2026-08-31: tài xế bấm bắt đầu chuyến (BOARDING ->
// IN_PROGRESS) nhưng màn phụ xe vẫn giữ trạng thái cũ cho tới khi kéo xuống
// làm mới hoặc chọn lại chuyến. Nguyên nhân là mỗi mutation chỉ làm mới đúng
// một hai key nó "nghĩ" là liên quan:
//   - arrive/depart/arrive-destination KHÔNG làm mới `schedule`, mà `schedule`
//     chính là nơi bộ chọn chuyến và `useActiveTrip` đọc status;
//   - start/complete KHÔNG làm mới manifest kiện hàng, trong khi
//     `availableActions` của kiện phụ thuộc trạng thái chuyến.
//
// Gom về một danh sách duy nhất để không còn chuyện mỗi hook nhớ một kiểu.
// Danh sách này là "mọi thứ đổi theo vòng đời chuyến", cố ý rộng: query chỉ
// thực sự refetch khi có màn đang mở dùng tới nó.
export function tripLifecycleQueryKeys(tripId: string | null): unknown[][] {
  // `schedule` không gắn tripId (key là ["schedule", from, to]) nên invalidate
  // theo prefix — nó phủ cả cửa sổ của `useActiveTrip` lẫn của bộ chọn chuyến.
  const keys: unknown[][] = [["schedule"]];

  if (tripId == null) {
    return keys;
  }

  return [
    ...keys,
    // Chi tiết chuyến: status, stops[].status, actualDepartureTime,
    // destinationArrivedAt.
    ["trip", tripId],
    // Manifest kiện hàng: `availableActions` mở/khoá theo trạng thái chuyến.
    ["assistant-parcels", tripId],
    // Sơ đồ ghế: chốt điểm dừng làm đổi danh sách khách còn trên xe.
    ["seat-map", tripId],
    // ETA: chốt/rời một điểm là backend tính lại toàn bộ target còn lại.
    ["tracking-etas", tripId],
    ["tracking-eta", tripId],
  ];
}

// Gọi trong `onSuccess` của mọi mutation vòng đời chuyến, và sau socket event
// tương ứng. Trả Promise để React Query giữ mutation ở trạng thái pending cho
// tới khi dữ liệu mới về — nút không nhấp nháy về trạng thái cũ.
export function invalidateTripLifecycle(
  queryClient: QueryClient,
  tripId: string | null,
): Promise<void> {
  return Promise.all(
    tripLifecycleQueryKeys(tripId).map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  ).then(() => undefined);
}
