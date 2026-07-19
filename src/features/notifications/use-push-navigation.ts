import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect } from "react";

import { useSession } from "@/features/session/session-context";

import { addNotificationResponseListener } from "./push";

// Khi user chạm vào push: làm mới inbox rồi điều hướng theo data.type (BE quy định
// TRIP_ASSIGNED / TRIP_UPDATE / PARCEL_UPDATE / NOTIFICATION). Chỉ chạy khi đã đăng nhập.
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
