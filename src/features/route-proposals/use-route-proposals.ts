import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import { ApiError } from "@/api/client";
import { newIdempotencyKey } from "@/api/idempotency";
import {
  createRouteChangeProposal,
  getAlternativeRoutes,
  getTripRouteChangeProposals,
} from "@/api/route-proposals";
import type { CreateRouteChangeProposalInput } from "@/api/types";

import { isRetryableError } from "./route-proposal-errors";

// Nhà xe hiếm khi đổi cấu hình tuyến thay thế giữa chuyến → giữ cache 5 phút.
const ALTERNATIVE_ROUTES_STALE_MS = 5 * 60_000;
const PENDING_POLL_MS = 30_000;

export function useAlternativeRoutes(tripId: string | null) {
  return useQuery({
    queryKey: ["alternative-routes", tripId],
    queryFn: () => getAlternativeRoutes(tripId as string),
    enabled: tripId != null,
    staleTime: ALTERNATIVE_ROUTES_STALE_MS,
  });
}

// Backend chưa bắn notification khi điều hành duyệt/từ chối (doc chưa có event),
// nên tạm poll. Chỉ poll khi còn đề xuất PENDING — hết pending là tự dừng, không
// ngốn pin suốt chuyến. Khi backend có notification, bỏ refetchInterval và
// invalidate queryKey này từ use-push-navigation.ts là xong.
export function useTripRouteProposals(tripId: string | null) {
  return useQuery({
    queryKey: ["route-change-proposals", tripId],
    queryFn: () => getTripRouteChangeProposals(tripId as string),
    enabled: tripId != null,
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      return items.some((item) => item.status === "PENDING")
        ? PENDING_POLL_MS
        : false;
    },
  });
}

// Gửi đề xuất, tự quản Idempotency-Key.
//
// Vì sao không để apiRequest tự sinh key như các mutation khác: API này cho phép
// nhiều đề xuất PENDING cùng lúc (doc mục 9.3). Nếu request timeout mà server
// thực ra đã nhận, bấm lại với key mới sẽ tạo hai đề xuất trùng. Doc mục 9.1
// bước 5 yêu cầu giữ nguyên key/body/path khi retry.
//
// Key bị xoá khi nội dung đề xuất đổi (chọn tuyến khác, sửa lý do) vì dùng lại
// key cho body khác sẽ ăn 422 IDEMPOTENCY_KEY_MISMATCH.
export function useSubmitRouteChangeProposal(tripId: string | null) {
  const queryClient = useQueryClient();
  const keyRef = useRef<string | null>(null);
  const [isRetry, setIsRetry] = useState(false);

  const mutation = useMutation({
    mutationFn: (input: CreateRouteChangeProposalInput) => {
      if (!keyRef.current) {
        keyRef.current = newIdempotencyKey();
      }
      return createRouteChangeProposal(tripId as string, input, keyRef.current);
    },
    onSuccess: () => {
      keyRef.current = null;
      setIsRetry(false);
      void queryClient.invalidateQueries({
        queryKey: ["route-change-proposals", tripId],
      });
    },
    onError: (error) => {
      // Lỗi mạng/5xx: giữ key để lần thử lại là cùng một thao tác logic.
      // Lỗi nghiệp vụ (422/409/404): server đã xử lý và từ chối, key cũ vô dụng.
      if (isRetryableError(error)) {
        setIsRetry(true);
        return;
      }

      keyRef.current = null;
      setIsRetry(false);

      // Hai lỗi này nghĩa là dữ liệu app đang cầm đã cũ so với server → nạp lại
      // ngay, đừng để tài xế bấm gửi tiếp vào cùng một tuyến đã hỏng.
      if (error instanceof ApiError) {
        if (error.code === "TRIP_NOT_EDITABLE") {
          void queryClient.invalidateQueries({ queryKey: ["schedule"] });
          void queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
        }
        if (error.code === "ROUTE_NOT_FOUND") {
          void queryClient.invalidateQueries({
            queryKey: ["alternative-routes", tripId],
          });
        }
      }
    },
  });

  // Gọi khi người dùng đổi tuyến đã chọn hoặc sửa lý do — body đổi thì key phải đổi.
  const resetKey = useCallback(() => {
    keyRef.current = null;
    setIsRetry(false);
  }, []);

  return {
    submit: mutation.mutate,
    reset: mutation.reset,
    resetKey,
    isPending: mutation.isPending,
    error: mutation.error,
    isRetry,
  };
}
