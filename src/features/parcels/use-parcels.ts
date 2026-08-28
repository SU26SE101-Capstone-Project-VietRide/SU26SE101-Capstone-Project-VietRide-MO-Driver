import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";

import {
  checkInParcel,
  confirmParcelDelivery,
  confirmParcelTransfer,
  deliverParcel,
  getAssistantTripParcels,
  loadParcel,
  reconcileStop,
  recordCustodyScan,
  reportCustodyException,
  resendDeliveryEmail,
  reweighParcel,
  scanParcelQr,
  unloadParcel,
  type AssistantParcelManifestParams,
  type CustodyExceptionInput,
  type CustodyScanInput,
  type ReconcileStopInput,
  type ReweighParcelInput,
  type UnloadParcelInput,
} from "@/api/parcel";
import type {
  AssistantParcelActionData,
  AssistantParcelManifestData,
} from "@/api/types";

const MANIFEST_KEY = "assistant-parcels";

// Manifest screen-ready của chuyến (Assistant). staleTime ngắn vì trạng thái
// kiện đổi liên tục từ nơi khác (khách trả tiền, operator chuyển kiện…).
export function useAssistantTripParcels(
  tripId: string | null,
  params: AssistantParcelManifestParams = {},
) {
  return useQuery({
    queryKey: [MANIFEST_KEY, tripId, params],
    queryFn: () => getAssistantTripParcels(tripId as string, params),
    enabled: tripId != null,
    staleTime: 15_000,
  });
}

// docs/Implements/API-Parcel-Driver.md §11: sau mutation phải merge action
// response vào card đang hiển thị thay vì gọi lại manifest cho từng thao tác.
// Merge chạy trên MỌI biến thể filter đang cache của cùng chuyến.
function mergeActionIntoManifest(
  queryClient: QueryClient,
  tripId: string | null,
  action: AssistantParcelActionData,
) {
  const parcelId = action.parcelState.parcelId;
  if (!parcelId) {
    return;
  }

  queryClient.setQueriesData<AssistantParcelManifestData>(
    { queryKey: [MANIFEST_KEY, tripId] },
    (previous) => {
      if (!previous) {
        return previous;
      }
      let changed = false;
      const items = previous.items.map((item) => {
        if (item.parcelId !== parcelId) {
          return item;
        }
        changed = true;
        const payment = action.parcelState.paymentState;
        return {
          ...item,
          status: action.parcelState.status ?? item.status,
          dropoffLocation:
            action.parcelState.dropoffLocation ?? item.dropoffLocation,
          paymentState: payment ?? item.paymentState,
          identityCheckHints:
            action.parcelState.identityCheckHints ?? item.identityCheckHints,
          currentCustody: action.currentCustody ?? item.currentCustody,
          // Sự cố đóng lại thì backend trả null — phải ghi đè, không ?? .
          activeIncident: action.activeIncident,
          // null nghĩa backend không trả actions (contract cũ) → giữ nguyên để
          // UI tiếp tục dùng bảng suy theo status.
          availableActions:
            action.availableActions ?? item.availableActions ?? null,
          // Mirror tiền để phần tóm tắt của card không lệch với paymentState.
          balanceRequiredVnd:
            payment?.balanceRequiredVnd ?? item.balanceRequiredVnd,
          balancePaidVnd: payment?.balancePaidVnd ?? item.balancePaidVnd,
          finalPaymentDeadline:
            payment?.finalPaymentDeadline ?? item.finalPaymentDeadline,
        };
      });
      return changed ? { ...previous, items } : previous;
    },
  );
}

// Merge để card đổi ngay, rồi invalidate để `summary`/`tripContext` (do backend
// đếm) bắt kịp ở lần refetch nền — vẫn là một lượt gọi manifest, không N+1.
function useApplyAction(tripId: string | null) {
  const queryClient = useQueryClient();
  return (action: AssistantParcelActionData) => {
    mergeActionIntoManifest(queryClient, tripId, action);
    void queryClient.invalidateQueries({ queryKey: [MANIFEST_KEY, tripId] });
  };
}

// Thao tác không trả action response (reweigh, confirm-transfer, manual
// confirm, resend email) — chỉ còn cách tải lại manifest.
function useInvalidateParcels(tripId: string | null) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: [MANIFEST_KEY, tripId] });
}

// Check-in kiện tại bến (RESERVED -> CHECKED_IN). Backend đối chiếu parcelCode
// với đúng trip nên body cần cả 2.
export function useCheckInParcel(tripId: string | null) {
  const apply = useApplyAction(tripId);
  return useMutation({
    mutationFn: (vars: {
      parcelId: string;
      parcelCode: string;
      // Ảnh bằng chứng đã upload (tối đa 3). Không gửi vẫn hợp lệ.
      photoUrls?: string[];
    }) =>
      checkInParcel(vars.parcelId, {
        tripId: tripId as string,
        parcelCode: vars.parcelCode,
        photoUrls: vars.photoUrls,
      }),
    onSuccess: apply,
  });
}

// Xếp kiện lên xe (READY_TO_LOAD -> LOADED).
export function useLoadParcel(tripId: string | null) {
  const apply = useApplyAction(tripId);
  return useMutation({
    mutationFn: (vars: { parcelId: string; parcelCode: string }) =>
      loadParcel(vars.parcelId, {
        tripId: tripId as string,
        parcelCode: vars.parcelCode,
      }),
    onSuccess: apply,
  });
}

export function useReweighParcel(tripId: string | null) {
  const invalidate = useInvalidateParcels(tripId);
  return useMutation({
    mutationFn: (vars: { parcelId: string; input: ReweighParcelInput }) =>
      reweighParcel(vars.parcelId, vars.input),
    onSuccess: invalidate,
  });
}

// Dỡ kiện. `input` bỏ trống = backend còn contract cũ (không nhận body).
export function useUnloadParcel(tripId: string | null) {
  const apply = useApplyAction(tripId);
  return useMutation({
    mutationFn: (vars: { parcelId: string; input?: UnloadParcelInput }) =>
      unloadParcel(vars.parcelId, vars.input),
    onSuccess: apply,
  });
}

// Bước giữa unload và confirm-delivery: giao kiện cho người nhận, gửi lại link
// xác nhận cho email người nhận (nếu có).
export function useDeliverParcel(tripId: string | null) {
  const apply = useApplyAction(tripId);
  return useMutation({
    mutationFn: (vars: { parcelId: string; photoUrls?: string[] }) =>
      deliverParcel(vars.parcelId, vars.photoUrls),
    onSuccess: apply,
  });
}

export function useConfirmParcelDelivery(tripId: string | null) {
  const invalidate = useInvalidateParcels(tripId);
  return useMutation({
    mutationFn: (vars: { parcelId: string; note: string }) =>
      confirmParcelDelivery(vars.parcelId, vars.note),
    onSuccess: invalidate,
  });
}

// Quét QR kiện: chỉ tra cứu, không mutate. Vẫn merge kết quả vào manifest vì
// response mang custody/incident/actions mới nhất của kiện đó.
export function useScanParcelQr(tripId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (parcelCode: string) =>
      scanParcelQr(tripId as string, parcelCode),
    onSuccess: (action) => mergeActionIntoManifest(queryClient, tripId, action),
  });
}

// Ghi nhận một lần quét custody (không đổi status kiện) — giữ chuỗi theo dõi
// liền mạch để reconcile trước khi rời bến không báo unresolved oan.
export function useCustodyScan(tripId: string | null) {
  const apply = useApplyAction(tripId);
  return useMutation({
    mutationFn: (vars: { parcelId: string; input: CustodyScanInput }) =>
      recordCustodyScan(vars.parcelId, vars.input),
    onSuccess: apply,
  });
}

// Báo sự cố custody (dỡ nhầm bến, kiện không khớp, không quét được QR).
// Contract 2026-08-28: chỉ TẠO báo cáo chờ Driver/điều hành duyệt — chưa có
// custody event, chưa mở tìm kiếm. Response không phải action shape nên không
// merge được vào card; chỉ tải lại manifest để card lấy incident mới nếu có.
export function useCustodyException(tripId: string | null) {
  const invalidate = useInvalidateParcels(tripId);
  return useMutation({
    mutationFn: (vars: { parcelId: string; input: CustodyExceptionInput }) =>
      reportCustodyException(vars.parcelId, vars.input),
    onSuccess: invalidate,
  });
}

// Đối soát kiện của một điểm dừng trước khi rời đi. Kết quả có thể mở incident
// nên phải tải lại manifest sau khi chạy.
export function useReconcileStop(tripId: string | null) {
  const invalidate = useInvalidateParcels(tripId);
  return useMutation({
    mutationFn: (vars: { stopId: string; input: ReconcileStopInput }) =>
      reconcileStop(tripId as string, vars.stopId, vars.input),
    onSuccess: invalidate,
  });
}

// Xác nhận nhận kiện chuyển đến (PENDING_TRANSFER_CONFIRM -> tiếp tục vòng đời
// trên chuyến mới).
export function useConfirmParcelTransfer(tripId: string | null) {
  const invalidate = useInvalidateParcels(tripId);
  return useMutation({
    mutationFn: (vars: { parcelId: string; parcelCode: string }) =>
      confirmParcelTransfer(vars.parcelId, vars.parcelCode),
    onSuccess: invalidate,
  });
}

// Gửi lại email xác nhận giao cho người nhận.
export function useResendDeliveryEmail(tripId: string | null) {
  const invalidate = useInvalidateParcels(tripId);
  return useMutation({
    mutationFn: (parcelId: string) => resendDeliveryEmail(parcelId),
    onSuccess: invalidate,
  });
}
