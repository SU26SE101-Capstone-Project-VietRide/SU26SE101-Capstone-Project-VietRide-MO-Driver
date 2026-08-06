import { useMemo } from "react";

import type { TripRouteGeometryData } from "@/api/types";
import { TripRouteMap } from "@/features/routes/trip-route-map";

import { decodePolyline } from "./polyline";

// Xem trước đường đi của một tuyến thay thế.
//
// Endpoint alternative-routes chỉ trả stopId cho từng điểm dừng, KHÔNG có tên và
// toạ độ, nên không cắm được marker — chỉ vẽ được đường. Số điểm dừng do màn
// hình hiển thị bằng chữ bên cạnh.
export function AlternativeRouteMap({
  tripId,
  pathPolyline,
}: {
  tripId: string;
  pathPolyline: string | null;
}) {
  const route = useMemo<TripRouteGeometryData>(() => {
    const points = pathPolyline ? decodePolyline(pathPolyline) : [];

    return {
      tripId,
      // Cần tối thiểu 2 điểm mới thành đường; ít hơn thì để null cho TripRouteMap
      // hiện bản đồ trống thay vì vẽ một đoạn vô nghĩa.
      geometry: points.length >= 2 ? { source: "ROUTE_POLYLINE", points } : null,
      originStation: null,
      intermediateStops: [],
      destinationStation: null,
    };
  }, [tripId, pathPolyline]);

  return <TripRouteMap route={route} />;
}
