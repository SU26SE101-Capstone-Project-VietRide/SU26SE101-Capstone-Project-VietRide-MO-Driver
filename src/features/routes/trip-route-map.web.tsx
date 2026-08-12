import { StyleSheet, Text, View } from "react-native";

import type { TripRouteGeometryData } from "@/api/types";
import { Spacing, type Palette } from "@/constants/theme";
import { useThemedStyles } from "@/hooks/use-theme";

// Khai lại type inline — KHÔNG import từ "./trip-route-map" vì trong bundle web
// đường dẫn đó resolve về chính file .web.tsx này (vòng lặp).
type VehiclePosition = {
  latitude: number;
  longitude: number;
  headingDeg: number | null;
};

// Web không có Mapbox native — chỉ hiện placeholder (app driver chạy Android).
export function TripRouteMap(_props: {
  route: TripRouteGeometryData;
  interactive?: boolean;
  onPress?: () => void;
  fill?: boolean;
  vehicle?: VehiclePosition | null;
  followVehicle?: boolean;
  passedStopIds?: string[];
}) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>
        Bản đồ chỉ hiển thị trên ứng dụng di động.
      </Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
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
  });
