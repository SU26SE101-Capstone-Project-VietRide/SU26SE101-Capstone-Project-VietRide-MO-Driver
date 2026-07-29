import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  checkInParcel,
  confirmParcelDelivery,
  deliverParcel,
  getAssistantTripParcels,
  loadParcel,
  reweighParcel,
  unloadParcel,
  type ReweighParcelInput,
} from "@/api/parcel";

// Danh sách kiện của chuyến (Assistant). staleTime ngắn vì trạng thái đổi liên tục.
export function useAssistantTripParcels(tripId: string | null) {
  return useQuery({
    queryKey: ["assistant-parcels", tripId],
    queryFn: () => getAssistantTripParcels(tripId as string),
    enabled: tripId != null,
    staleTime: 15_000,
  });
}

// Sau mỗi thao tác, làm mới lại danh sách để lấy trạng thái mới từ backend.
function useInvalidateParcels(tripId: string | null) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ["assistant-parcels", tripId] });
}

// Check-in kiện tại bến (RESERVED -> CHECKED_IN). Backend đối chiếu parcelCode
// với đúng trip nên body cần cả 2.
export function useCheckInParcel(tripId: string | null) {
  const invalidate = useInvalidateParcels(tripId);
  return useMutation({
    mutationFn: (vars: { parcelId: string; parcelCode: string }) =>
      checkInParcel(vars.parcelId, {
        tripId: tripId as string,
        parcelCode: vars.parcelCode,
      }),
    onSuccess: invalidate,
  });
}

// Xếp kiện lên xe (READY_TO_LOAD -> LOADED).
export function useLoadParcel(tripId: string | null) {
  const invalidate = useInvalidateParcels(tripId);
  return useMutation({
    mutationFn: (vars: { parcelId: string; parcelCode: string }) =>
      loadParcel(vars.parcelId, {
        tripId: tripId as string,
        parcelCode: vars.parcelCode,
      }),
    onSuccess: invalidate,
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

export function useUnloadParcel(tripId: string | null) {
  const invalidate = useInvalidateParcels(tripId);
  return useMutation({
    mutationFn: (parcelId: string) => unloadParcel(parcelId),
    onSuccess: invalidate,
  });
}

// Bước giữa unload và confirm-delivery: giao kiện cho người nhận, sinh token 48h.
export function useDeliverParcel(tripId: string | null) {
  const invalidate = useInvalidateParcels(tripId);
  return useMutation({
    mutationFn: (parcelId: string) => deliverParcel(parcelId),
    onSuccess: invalidate,
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
