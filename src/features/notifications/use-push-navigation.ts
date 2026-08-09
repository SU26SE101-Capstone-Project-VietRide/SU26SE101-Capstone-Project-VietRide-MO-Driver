import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect } from "react";

import { useSession } from "@/features/session/session-context";

import { addNotificationResponseListener } from "./push";

// Khi user chạm vào push: làm mới inbox rồi điều hướng theo data.type (BE quy định
// SHUTTLE_ASSIGNED / BOOKING_CREATED / BOOKING_CANCELLED / PASSENGER_BOARDED /
// BOOKING_TRANSFERRED / TRIP_ASSIGNED / TRIP_UPDATE / PARCEL_UPDATE / NOTIFICATION).
// Chỉ chạy khi đã đăng nhập.
export function usePushNavigation() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { role } = useSession();

  useEffect(() => {
    if (!role) {
      return;
    }

    const cleanup = addNotificationResponseListener((data) => {
      // Push không phải source of truth → luôn refetch inbox để lấy trạng thái mới.
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });

      const type = typeof data.type === "string" ? data.type : "";

      if (type === "SHUTTLE_ASSIGNED") {
        // Push chỉ mang shuttleTripId + mainTripId; list cũng cần làm mới để
        // driver mất push vẫn thấy chuyến qua GET /v1/driver/shuttle-trips.
        void queryClient.invalidateQueries({ queryKey: ["shuttle-trips"] });
        const shuttleTripId =
          typeof data.shuttleTripId === "string" ? data.shuttleTripId : null;
        if (role === "DRIVER" && shuttleTripId) {
          router.push(`/driver/shuttle/${shuttleTripId}`);
        } else {
          router.push("/notifications");
        }
        return;
      }

      if (
        type === "BOOKING_CREATED" ||
        type === "BOOKING_CANCELLED" ||
        type === "PASSENGER_BOARDED" ||
        type === "BOOKING_TRANSFERRED"
      ) {
        // FCM chỉ là tín hiệu — manifest/seat-map REST là source of truth
        // (FE-REQUEST-realtime-booking-notify-RESPONSE.md). Data FCM toàn
        // string; tripId có thì invalidate đúng chuyến, không thì thôi
        // (refetchInterval của manifest sẽ bắt kịp).
        const tripId = typeof data.tripId === "string" ? data.tripId : null;
        if (tripId) {
          void queryClient.invalidateQueries({ queryKey: ["manifest", tripId] });
          void queryClient.invalidateQueries({ queryKey: ["seat-map", tripId] });
          void queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
        }
        // BOOKING_TRANSFERRED phát cho cả trip cũ và mới → làm mới thêm nếu có.
        for (const key of ["oldTripId", "newTripId"] as const) {
          const otherId = typeof data[key] === "string" ? data[key] : null;
          if (otherId && otherId !== tripId) {
            void queryClient.invalidateQueries({
              queryKey: ["manifest", otherId],
            });
            void queryClient.invalidateQueries({
              queryKey: ["seat-map", otherId],
            });
            void queryClient.invalidateQueries({ queryKey: ["trip", otherId] });
          }
        }
        // deepLink dạng vietride://driver/trips/{tripId}/bookings/{bookingId}
        // chưa có route tương ứng → điều hướng về màn phù hợp theo role.
        router.push(role === "DRIVER" ? "/driver/trip" : "/assistant/boarding");
        return;
      }

      if (type === "PARCEL_UPDATE") {
        router.push(role === "ASSISTANT" ? "/assistant/cargo" : "/notifications");
        return;
      }

      if (type === "TRIP_ASSIGNED" || type === "TRIP_UPDATE") {
        router.push(role === "DRIVER" ? "/driver/trip" : "/assistant/boarding");
        return;
      }

      // NOTIFICATION và các loại khác → mở inbox thông báo.
      router.push("/notifications");
    });

    return cleanup;
  }, [role, router, queryClient]);
}
