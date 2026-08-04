import { GoogleMaps } from "expo-maps";
import { useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import type { GeoPoint, TripRouteGeometryData } from "@/api/types";
import { Spacing, type Palette } from "@/constants/theme";
import { ActionButton } from "@/features/operations/ui";
import { useThemedStyles } from "@/hooks/use-theme";

// Toạ độ hợp lệ mới đưa lên bản đồ. BE đã lọc, nhưng payload lạ (NaN, null lọt
// qua) sẽ làm expo-maps crash nên vẫn chặn ở client.
function isValidPoint(point: GeoPoint): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

// Khung nhìn: tâm bounding box + zoom ước lượng theo độ trải của tuyến.
function cameraFor(points: GeoPoint[]): { center: GeoPoint; zoom: number } {
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
  route: TripRouteGeometryData;
  // false = xem trước trong card: TẮT cử chỉ để không giành scroll với trang.
  // true = toàn màn hình: bật đầy đủ kéo/zoom/xoay.
  interactive?: boolean;
  onPress?: () => void;
  // true = map chiếm hết không gian cha (màn toàn màn hình).
  fill?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);

  // geometry = null nghĩa là tuyến chưa có đường đi thật. KHÔNG được nối các
  // marker lại thành tuyến giả (Tracking Phase 12 cấm) → để mảng rỗng.
  const line = useMemo(
    () => (route.geometry?.points ?? []).filter(isValidPoint),
    [route.geometry],
  );

  const markers = useMemo(() => {
    const items: {
      id: string;
      coordinates: GeoPoint;
      title: string;
      snippet?: string;
    }[] = [];

    if (route.originStation && isValidPoint(route.originStation)) {
      items.push({
        id: route.originStation.stationId,
        coordinates: {
          latitude: route.originStation.latitude,
          longitude: route.originStation.longitude,
        },
        title: route.originStation.name,
        snippet: "Điểm đi",
      });
    }

    route.intermediateStops
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .filter(isValidPoint)
      .forEach((stop) => {
        items.push({
          id: stop.stopId,
          coordinates: { latitude: stop.latitude, longitude: stop.longitude },
          title: stop.name,
          snippet: `Điểm dừng ${stop.sequence}`,
        });
      });

    if (route.destinationStation && isValidPoint(route.destinationStation)) {
      items.push({
        id: route.destinationStation.stationId,
        coordinates: {
          latitude: route.destinationStation.latitude,
          longitude: route.destinationStation.longitude,
        },
        title: route.destinationStation.name,
        snippet: "Điểm đến",
      });
    }

    return items;
  }, [route]);

  // Không có đường thì căn khung theo marker để tài xế vẫn thấy các bến.
  const camera = useMemo(
    () => cameraFor(line.length > 0 ? line : markers.map((m) => m.coordinates)),
    [line, markers],
  );

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

  if (line.length === 0 && markers.length === 0) {
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
      polylines={
        line.length > 0
          ? [{ id: "route", coordinates: line, color: "#02C39A", width: 6 }]
          : []
      }
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

      {!route.geometry ? (
        <Text style={styles.note}>
          Tuyến chưa có đường đi thực tế — chỉ hiển thị các điểm dừng.
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
