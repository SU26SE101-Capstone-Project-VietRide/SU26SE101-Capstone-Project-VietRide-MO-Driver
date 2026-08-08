import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  completeShuttle,
  deliverShuttleStop,
  getDriverShuttleTrips,
  getShuttleManifest,
  noShowShuttleStop,
  pickupShuttleStop,
  startShuttle,
} from "@/api/shuttle";

// Danh sách shuttle của driver — dùng window default của backend
// (hôm nay → +14 ngày ICT) nên không truyền from/to.
export function useDriverShuttleTrips() {
  return useQuery({
    queryKey: ["shuttle-trips"],
    queryFn: () => getDriverShuttleTrips(),
  });
}

export function useShuttleManifest(shuttleTripId: string | null) {
  return useQuery({
    queryKey: ["shuttle-manifest", shuttleTripId],
    queryFn: () => getShuttleManifest(shuttleTripId as string),
    enabled: shuttleTripId != null,
  });
}

// Gom các mutation lifecycle. onSettled (kể cả khi lỗi 409/INVALID_STATUS)
// đều refetch manifest + list: state đã lệch thì càng phải lấy lại từ backend
// — backend là nguồn trạng thái duy nhất.
export function useShuttleLifecycle(shuttleTripId: string | null) {
  const queryClient = useQueryClient();

  // Nút thao tác chỉ render khi đã có manifest (tức có id), nhưng vẫn chặn
  // cứng để không bao giờ bắn request với id null nếu bị gọi nhầm.
  const requireId = () => {
    if (!shuttleTripId) {
      throw new Error("Thiếu shuttleTripId — chưa chọn chuyến trung chuyển.");
    }
    return shuttleTripId;
  };

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["shuttle-manifest", shuttleTripId],
      }),
      queryClient.invalidateQueries({ queryKey: ["shuttle-trips"] }),
    ]);
  };

  const start = useMutation({
    mutationFn: () => startShuttle(requireId()),
    onSettled: refresh,
  });

  const pickup = useMutation({
    mutationFn: (pickupOrder: number) =>
      pickupShuttleStop(requireId(), pickupOrder),
    onSettled: refresh,
  });

  const deliver = useMutation({
    mutationFn: (pickupOrder: number) =>
      deliverShuttleStop(requireId(), pickupOrder),
    onSettled: refresh,
  });

  const noShow = useMutation({
    mutationFn: (input: { pickupOrder: number; reason: string }) =>
      noShowShuttleStop(requireId(), input.pickupOrder, input.reason),
    onSettled: refresh,
  });

  const complete = useMutation({
    mutationFn: () => completeShuttle(requireId()),
    onSettled: refresh,
  });

  // Chặn bấm chồng thao tác: state machine backend xử tuần tự, gửi song song
  // chỉ tạo thêm 409.
  const isBusy =
    start.isPending ||
    pickup.isPending ||
    deliver.isPending ||
    noShow.isPending ||
    complete.isPending;

  return { start, pickup, deliver, noShow, complete, isBusy };
}
