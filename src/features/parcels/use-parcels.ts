import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  confirmParcelDelivery,
  getAssistantTripParcels,
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

export function useConfirmParcelDelivery(tripId: string | null) {
  const invalidate = useInvalidateParcels(tripId);
  return useMutation({
    mutationFn: (vars: { parcelId: string; note: string }) =>
      confirmParcelDelivery(vars.parcelId, vars.note),
    onSuccess: invalidate,
  });
}
