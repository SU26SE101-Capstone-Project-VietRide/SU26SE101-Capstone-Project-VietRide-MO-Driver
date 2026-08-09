import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect } from "react";

import { useSession } from "@/features/session/session-context";

import {
  actionFromPushData,
  invalidationKeysForAction,
  resolveActionHref,
} from "./notification-action";
import { addNotificationResponseListener } from "./push";

// Khi user chạm vào push: làm mới inbox rồi điều hướng theo action.
// Từ Phase 11 BE gửi kèm actionType + actionParams (JSON string) trong FCM data;
// payload cũ chỉ có data.type + id legacy nên vẫn được suy ra action ở
// actionFromPushData. Chỉ chạy khi đã đăng nhập.
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

      const action = actionFromPushData(data);

      // FCM chỉ là tín hiệu — manifest/seat-map/REST mới là source of truth
      // (FE-REQUEST-realtime-booking-notify-RESPONSE.md).
      for (const queryKey of invalidationKeysForAction(action)) {
        void queryClient.invalidateQueries({ queryKey });
      }

      // BOOKING_TRANSFERRED phát cho cả trip cũ và mới; hai id này nằm ở data
      // legacy chứ không có trong action.params.
      const params = action.params as Record<string, unknown>;
      const tripId = typeof params.tripId === "string" ? params.tripId : null;
      for (const key of ["oldTripId", "newTripId"] as const) {
        const otherId = typeof data[key] === "string" ? data[key] : null;
        if (otherId && otherId !== tripId) {
          void queryClient.invalidateQueries({ queryKey: ["manifest", otherId] });
          void queryClient.invalidateQueries({ queryKey: ["seat-map", otherId] });
          void queryClient.invalidateQueries({ queryKey: ["trip", otherId] });
        }
      }

      // Action không có màn đích trong app crew (ví, subscription, NONE...) →
      // mở inbox để user vẫn đọc được nội dung.
      const href = resolveActionHref(action, role);
      router.push(href ?? "/notifications");
    });

    return cleanup;
  }, [role, router, queryClient]);
}
