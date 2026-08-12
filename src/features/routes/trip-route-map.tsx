import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import type { GeoPoint, TripRouteGeometryData } from "@/api/types";
import { Spacing, type Palette } from "@/constants/theme";
import { ActionButton } from "@/features/operations/ui";
import { useThemeMode } from "@/features/theme/theme-mode";
import { useThemedStyles } from "@/hooks/use-theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Mapbox from "./mapbox";

// Vị trí xe hiển thị trên bản đồ. headingDeg = null khi thiết bị không có la
// bàn; speedKmh = null khi GPS không trả tốc độ.
export type VehiclePosition = {
  latitude: number;
  longitude: number;
  headingDeg: number | null;
  speedKmh: number | null;
};

// Màu polyline tuyến — teal thương hiệu, đè trên lớp casing tối cho nổi khối
// như các app dẫn đường thật.
const ROUTE_COLOR = "#02C39A";
const ROUTE_CASING_COLOR = "#043D33";
// Điểm dừng đã qua — xám lặng để mắt tài xế chỉ bám vào phần còn lại của tuyến.
const PASSED_COLOR = "#4A5A57";

// Padding khi camera fit toàn tuyến (điểm sát mép vẫn nhìn thấy marker).
const FIT_PADDING = {
  paddingLeft: 48,
  paddingRight: 48,
  paddingTop: 64,
  paddingBottom: 64,
};

// Toạ độ hợp lệ mới đưa lên bản đồ. BE đã lọc, nhưng payload lạ (NaN, null lọt
// qua) sẽ làm map native crash nên vẫn chặn ở client.
function isValidPoint(point: GeoPoint): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

// Bounds bao trọn các điểm để camera fit toàn tuyến. Mapbox dùng [lng, lat].
function boundsFor(points: GeoPoint[]): {
  ne: [number, number];
  sw: [number, number];
} {
  if (points.length === 0) {
    // Mặc định quanh TP.HCM khi chưa có điểm nào.
    return { ne: [106.85, 10.95], sw: [106.55, 10.6] };
  }

  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);

  return {
    ne: [Math.max(...lngs), Math.max(...lats)],
    sw: [Math.min(...lngs), Math.min(...lats)],
  };
}

type RouteMarker = {
  id: string;
  coordinates: GeoPoint;
  kind: "origin" | "stop" | "destination";
};

// Puck xe kiểu navigation: lõi teal mũi tên trắng xoay theo heading + vòng
// halo teal "thở" liên tục để tài xế thấy ngay tín hiệu đang sống.
function VehiclePuck({ headingDeg }: { headingDeg: number | null }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1700, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
  }, [pulse]);

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.55 + pulse.value * 0.95 }],
    opacity: 0.4 * (1 - pulse.value),
  }));

  return (
    <View style={puckStyles.wrap}>
      <Animated.View style={[puckStyles.halo, haloStyle]} />
      <View
        style={[
          puckStyles.core,
          { transform: [{ rotate: `${headingDeg ?? 0}deg` }] },
        ]}
      >
        <MaterialIcons name="navigation" size={20} color="#FFFFFF" />
      </View>
    </View>
  );
}

// Style của puck cố định theo brand, không đổi theo theme — trên nền bản đồ
// tối/sáng đều cần đúng một khối teal viền trắng này.
const puckStyles = StyleSheet.create({
  wrap: {
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: ROUTE_COLOR,
  },
  core: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ROUTE_COLOR,
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
    elevation: 6,
    shadowColor: "#000000",
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
});

export function TripRouteMap({
  route,
  interactive = false,
  onPress,
  fill = false,
  vehicle = null,
  followVehicle = false,
  passedStopIds,
}: {
  route: TripRouteGeometryData;
  // false = xem trước trong card: TẮT cử chỉ để không giành scroll với trang.
  // true = toàn màn hình: bật đầy đủ kéo/zoom/xoay.
  interactive?: boolean;
  onPress?: () => void;
  // true = map chiếm hết không gian cha (màn toàn màn hình).
  fill?: boolean;
  // Vị trí xe realtime — có thì vẽ marker mũi tên xoay theo heading.
  vehicle?: VehiclePosition | null;
  // true = camera bám theo xe (màn theo dõi hành trình).
  followVehicle?: boolean;
  // stopId đã qua (ARRIVED/SKIPPED) để đổi màu marker phân biệt với sắp tới.
  passedStopIds?: string[];
}) {
  const styles = useThemedStyles(makeStyles);
  // Theo theme TRONG APP (Cài đặt), không phải theme hệ điều hành — hai cái
  // có thể lệch nhau và bản đồ phải khớp với UI xung quanh.
  const { mode } = useThemeMode();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<Mapbox.Camera>(null);

  // geometry = null nghĩa là tuyến chưa có đường đi thật. KHÔNG được nối các
  // marker lại thành tuyến giả (Tracking Phase 12 cấm) → để mảng rỗng.
  const line = useMemo(
    () => (route.geometry?.points ?? []).filter(isValidPoint),
    [route.geometry],
  );

  const markers = useMemo(() => {
    const items: RouteMarker[] = [];

    if (route.originStation && isValidPoint(route.originStation)) {
      items.push({
        id: route.originStation.stationId,
        coordinates: {
          latitude: route.originStation.latitude,
          longitude: route.originStation.longitude,
        },
        kind: "origin",
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
          kind: "stop",
        });
      });

    if (route.destinationStation && isValidPoint(route.destinationStation)) {
      items.push({
        id: route.destinationStation.stationId,
        coordinates: {
          latitude: route.destinationStation.latitude,
          longitude: route.destinationStation.longitude,
        },
        kind: "destination",
      });
    }

    return items;
  }, [route]);

  const passedSet = useMemo(
    () => new Set(passedStopIds ?? []),
    [passedStopIds],
  );

  // Không có đường thì căn khung theo marker để tài xế vẫn thấy các bến.
  const bounds = useMemo(
    () => boundsFor(line.length > 0 ? line : markers.map((m) => m.coordinates)),
    [line, markers],
  );

  // GeoJSON LineString cho polyline — Mapbox dùng thứ tự [lng, lat].
  const routeShape = useMemo(
    () =>
      ({
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: line.map((p) => [p.longitude, p.latitude]),
        },
      }) as const,
    [line],
  );

  // Camera bám xe: mỗi lần vị trí đổi thì easeTo tới xe, xoay theo heading.
  useEffect(() => {
    if (!followVehicle || !vehicle) {
      return;
    }
    cameraRef.current?.setCamera({
      centerCoordinate: [vehicle.longitude, vehicle.latitude],
      zoomLevel: 15,
      heading: vehicle.headingDeg ?? 0,
      animationDuration: 900,
      animationMode: "easeTo",
    });
  }, [followVehicle, vehicle]);

  // Tắt bám xe → trả camera về khung toàn tuyến.
  useEffect(() => {
    if (followVehicle) {
      return;
    }
    cameraRef.current?.setCamera({
      bounds: { ...bounds, ...FIT_PADDING },
      heading: 0,
      animationDuration: 600,
    });
  }, [followVehicle, bounds]);

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
    <Mapbox.MapView
      style={fill ? styles.mapFill : styles.map}
      // Style tối khớp theme; Dark của Mapbox vốn ít POI nên không cần custom style.
      styleURL={mode === "dark" ? Mapbox.StyleURL.Dark : Mapbox.StyleURL.Street}
      scaleBarEnabled={false}
      logoEnabled={false}
      attributionEnabled={false}
      compassEnabled={interactive}
      // La bàn né status bar + hàng nút back/bám xe (44px) ở màn toàn màn hình.
      compassPosition={{ top: insets.top + 44 + 12, right: 12 }}
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      rotateEnabled={interactive}
      pitchEnabled={interactive}
      onPress={onPress ? () => onPress() : undefined}
    >
      <Mapbox.Camera
        ref={cameraRef}
        defaultSettings={{ bounds: { ...bounds, ...FIT_PADDING } }}
      />

      {line.length > 0 ? (
        <Mapbox.ShapeSource id="route" shape={routeShape}>
          {/* Casing tối rộng bên dưới + line teal bên trên → tuyến nổi khối
              trên mọi nền bản đồ, giống style của app dẫn đường. */}
          <Mapbox.LineLayer
            id="route-casing"
            style={{
              lineColor: ROUTE_CASING_COLOR,
              lineWidth: 10,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
          <Mapbox.LineLayer
            id="route-line"
            style={{
              lineColor: ROUTE_COLOR,
              lineWidth: 5.5,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        </Mapbox.ShapeSource>
      ) : null}

      {markers.map((m) => (
        <Mapbox.MarkerView
          key={m.id}
          coordinate={[m.coordinates.longitude, m.coordinates.latitude]}
          allowOverlap
        >
          {m.kind === "destination" ? (
            // Bến đích: huy hiệu cờ — đích đến duy nhất của cả tuyến.
            <View style={styles.destinationBadge}>
              <MaterialIcons name="sports-score" size={15} color={ROUTE_COLOR} />
            </View>
          ) : m.kind === "origin" ? (
            // Bến đi: vòng rỗng — nơi đã xuất phát, không cần chú ý nữa.
            <View style={styles.originRing} />
          ) : (
            // Điểm dừng: chấm trắng viền teal, đã qua thì lặng màu.
            <View
              style={[
                styles.stopDot,
                passedSet.has(m.id) ? styles.stopDotPassed : null,
              ]}
            />
          )}
        </Mapbox.MarkerView>
      ))}

      {vehicle ? (
        <Mapbox.MarkerView
          coordinate={[vehicle.longitude, vehicle.latitude]}
          allowOverlap
        >
          <VehiclePuck headingDeg={vehicle.headingDeg} />
        </Mapbox.MarkerView>
      ) : null}
    </Mapbox.MapView>
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
    stopDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: "#FFFFFF",
      borderWidth: 3,
      borderColor: ROUTE_COLOR,
    },
    stopDotPassed: {
      backgroundColor: PASSED_COLOR,
      borderColor: PASSED_COLOR,
      opacity: 0.85,
    },
    originRing: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: "transparent",
      borderWidth: 4,
      borderColor: ROUTE_COLOR,
    },
    destinationBadge: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#FFFFFF",
      borderWidth: 2,
      borderColor: ROUTE_COLOR,
      elevation: 4,
      shadowColor: "#000000",
      shadowOpacity: 0.3,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
    },
  });
