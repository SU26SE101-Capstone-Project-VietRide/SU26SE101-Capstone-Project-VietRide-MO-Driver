import { ScrollView, StyleSheet } from "react-native";

import { Spacing, type Palette } from "@/constants/theme";
import { ActionButton, SectionTitle, SurfaceCard } from "@/features/operations/ui";
import { formatTimeHM, tripStatusMeta } from "@/features/trips/trip-format";
import { useSelectedTrip } from "@/features/trips/selected-trip-context";
import { useThemedStyles } from "@/hooks/use-theme";

// Bộ chọn ca trong ngày. Tự ẩn khi crew chỉ có một chuyến — lúc đó không có gì
// để chọn, hiện ra chỉ tốn một card.
export function TripPicker({
  delay = 0,
  subtitle = "Chọn ca cần thao tác trong ngày.",
}: {
  delay?: number;
  subtitle?: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const { tripId, trips, selectTrip } = useSelectedTrip();

  if (trips.length < 2) {
    return null;
  }

  return (
    <SurfaceCard delay={delay}>
      <SectionTitle icon="alt-route" title="Chọn chuyến" subtitle={subtitle} />
      {/* Nhiều ca/ngày (có ngày 9+ ca) → chip cuộn ngang 1 dòng thay vì xếp
          dọc chiếm cả màn hình. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {trips.map((trip) => (
          <ActionButton
            key={trip.tripId}
            label={`${formatTimeHM(trip.departureDateTime)} • ${tripStatusMeta(trip.status).label}`}
            tone={trip.tripId === tripId ? "primary" : "secondary"}
            small
            onPress={() => selectTrip(trip.tripId)}
          />
        ))}
      </ScrollView>
    </SurfaceCard>
  );
}

const makeStyles = (_c: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      gap: Spacing.two,
      paddingRight: Spacing.two,
    },
  });
