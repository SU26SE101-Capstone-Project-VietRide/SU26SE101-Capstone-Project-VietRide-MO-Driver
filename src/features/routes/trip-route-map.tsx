import polyline from "@mapbox/polyline";
import { GoogleMaps } from "expo-maps";
import { useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import type { TripRouteData } from "@/api/types";
import { Spacing, type Palette } from "@/constants/theme";
import { ActionButton } from "@/features/operations/ui";
import { useThemedStyles } from "@/hooks/use-theme";

type LatLng = { latitude: number; longitude: number };

// Station có thể thiếu toạ độ (BE cho phép null từng field) → chỉ lấy khi đủ cả 2.
function stationPoint(station: {
  latitude: number | null;
  longitude: number | null;
}): LatLng | null {
  if (station.latitude == null || station.longitude == null) {
    return null;
  }
  return { latitude: station.latitude, longitude: station.longitude };
}

// Đường vẽ: ưu tiên pathPolyline (Google encoded, precision-5). Nếu null →
// fallback nối waypoint theo thứ tự originStation → stops → destinationStation.
function buildRouteLine(route: TripRouteData): LatLng[] {
  if (route.pathPolyline) {
    try {
      // polyline.decode trả [[lat, lng], ...]
      return polyline
        .decode(route.pathPolyline)
        .map(([latitude, longitude]) => ({ latitude, longitude }));
    } catch {
      // Polyline hỏng → rơi xuống fallback bên dưới.
    }
  }

  const origin = stationPoint(route.originStation);
  const destination = stationPoint(route.destinationStation);
  const stops = [...route.stops]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((stop) => ({ latitude: stop.latitude, longitude: stop.longitude }));

  return [origin, ...stops, destination].filter(
    (point): point is LatLng => point !== null,
  );
}

// Khung nhìn: tâm bounding box + zoom ước lượng theo độ trải của tuyến.
function cameraFor(points: LatLng[]): { center: LatLng; zoom: number } {
  if (points.length === 0) {
    // Mặc định về TP.HCM khi chưa có điểm nào.
    return { center: { latitude: 10.7769, longitude: 106.7009 }, zoom: 10 };
  }

  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const span = Math.max(maxLat - minLat, maxLng - minLng);

  const zoom =
    span > 5 ? 5 : span > 2 ? 6 : span > 1 ? 7 : span > 0.5 ? 8 : span > 0.2 ? 9 : span > 0.05 ? 11 : 13;

  return {
    center: {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
    },
    zoom,
  };
}

export function TripRouteMap({
  route,
  interactive = false,
  onPress,
  fill = false,
}: {
  route: TripRouteData;
  // false = xem trước trong card: TẮT cử chỉ để không giành scroll với trang.
  // true = toàn màn hình: bật đầy đủ kéo/zoom/xoay.
  interactive?: boolean;
  onPress?: () => void;
  // true = map chiếm hết không gian cha (màn toàn màn hình).
  fill?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);

  const line = useMemo(() => buildRouteLine(route), [route]);
  const camera = useMemo(() => cameraFor(line), [line]);

  const markers = useMemo(() => {
    const origin = stationPoint(route.originStation);
    const destination = stationPoint(route.destinationStation);

    const items: {
      id: string;
      coordinates: LatLng;
      title: string;
      snippet?: string;
    }[] = [];

    if (origin) {
      items.push({
        id: route.originStation.stationId,
        coordinates: origin,
        title: route.originStation.name,
        snippet: "Điểm đi",
      });
    }

    route.stops
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .forEach((stop) => {
        items.push({
          id: stop.stopId,
          coordinates: { latitude: stop.latitude, longitude: stop.longitude },
          title: stop.name,
          snippet: `Điểm dừng ${stop.orderIndex}`,
        });
      });

    if (destination) {
      items.push({
        id: route.destinationStation.stationId,
        coordinates: destination,
        title: route.destinationStation.name,
        snippet: "Điểm đến",
      });
    }

    return items;
  }, [route]);

  // expo-maps chỉ dựng bản đồ native; web chưa hỗ trợ.
  if (Platform.OS === "web") {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>
          Bản đồ chỉ hiển thị trên ứng dụng di động.
        </Text>
      </View>
    );
  }

  if (line.length === 0) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>
          Tuyến này chưa có toạ độ để vẽ bản đồ.
        </Text>
      </View>
    );
  }

  const map = (
    <GoogleMaps.View
      style={fill ? styles.mapFill : styles.map}
      cameraPosition={{ coordinates: camera.center, zoom: camera.zoom }}
      markers={markers}
      polylines={[
        { id: "route", coordinates: line, color: "#02C39A", width: 6 },
      ]}
      uiSettings={{
        // Chế độ xem trước: tắt hết cử chỉ để ScrollView của trang cuộn mượt.
        scrollGesturesEnabled: interactive,
        zoomGesturesEnabled: interactive,
        rotationGesturesEnabled: interactive,
        tiltGesturesEnabled: interactive,
        zoomControlsEnabled: interactive,
        mapToolbarEnabled: interactive,
        compassEnabled: interactive,
        myLocationButtonEnabled: interactive,
      }}
      properties={{ isMyLocationEnabled: interactive }}
      onMapClick={onPress}
    />
  );

  if (fill) {
    return map;
  }

  return (
    <View style={styles.mapWrap}>
      {/* Lớp phủ bắt chạm: ở chế độ xem trước, chạm vào đâu cũng mở toàn màn hình. */}
      <Pressable onPress={onPress} disabled={!onPress}>
        <View pointerEvents="none">{map}</View>
      </Pressable>

      {onPress ? (
        <ActionButton
          icon="fullscreen"
          label="Xem bản đồ toàn màn hình"
          tone="secondary"
          small
          onPress={onPress}
        />
      ) : null}

      {!route.pathPolyline ? (
        <Text style={styles.note}>
          Tuyến chưa có đường đi thực tế — đang nối tạm qua các điểm dừng.
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    mapWrap: {
      gap: Spacing.two,
    },
    map: {
      height: 260,
      borderRadius: 18,
      overflow: "hidden",
    },
    mapFill: {
      flex: 1,
    },
    placeholder: {
      height: 120,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surfaceDeep,
      padding: Spacing.three,
    },
    placeholderText: {
      color: c.textMeta,
      fontSize: 14,
      textAlign: "center",
    },
    note: {
      color: c.textMeta,
      fontSize: 13,
      lineHeight: 18,
    },
  });
