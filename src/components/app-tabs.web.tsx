import {
    TabList,
    TabListProps,
    Tabs,
    TabSlot,
    TabTrigger,
    TabTriggerSlotProps,
} from "expo-router/ui";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";

import { Colors, MaxContentWidth, Spacing } from "@/constants/theme";

type TabVariant = "driver" | "assistant";

const WEB_TABS = {
  driver: [
    { name: "overview", label: "Lịch làm việc", href: "/driver" },
    { name: "trip", label: "Chuyến", href: "/driver/trip" },
    { name: "incident", label: "Sự cố", href: "/driver/incident" },
    { name: "support", label: "Hỗ trợ", href: "/driver/support" },
    { name: "settings", label: "Cài đặt", href: "/driver/settings" },
  ],
  assistant: [
    { name: "overview", label: "Lịch làm việc", href: "/assistant" },
    { name: "boarding", label: "Đón khách", href: "/assistant/boarding" },
    { name: "cargo", label: "Hàng hóa", href: "/assistant/cargo" },
    { name: "stops", label: "Điểm dừng", href: "/assistant/stops" },
    { name: "support", label: "Hỗ trợ", href: "/assistant/support" },
    { name: "settings", label: "Cài đặt", href: "/assistant/settings" },
  ],
} as const;

type AppTabsProps = {
  variant: TabVariant;
};

export default function AppTabs({ variant }: AppTabsProps) {
  const tabs = WEB_TABS[variant];

  return (
    <Tabs>
      <TabSlot style={{ height: "100%" }} />
      <TabList asChild>
        <CustomTabList
          roleBadge={variant === "driver" ? "Driver" : "Assistant"}
        >
          {tabs.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
              <TabButton>{tab.label}</TabButton>
            </TabTrigger>
          ))}
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({
  children,
  isFocused,
  ...props
}: TabTriggerSlotProps) {
  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type={isFocused ? "backgroundSelected" : "backgroundElement"}
        style={styles.tabButtonView}
      >
        <ThemedText
          type="small"
          themeColor={isFocused ? "text" : "textSecondary"}
        >
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList(
  props: TabListProps & {
    roleBadge: string;
  },
) {
  return (
    <View {...props} style={styles.tabListContainer}>
      <ThemedView type="backgroundElement" style={styles.innerContainer}>
        <ThemedText type="smallBold" style={styles.brandText}>
          VietRide Ops
        </ThemedText>

        {props.children}

        <ThemedView style={styles.roleBadge}>
          <ThemedText type="small" themeColor="textSecondary">
            {props.roleBadge}
          </ThemedText>
        </ThemedView>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: "absolute",
    width: "100%",
    padding: Spacing.three,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
    borderRadius: Spacing.five,
    flexDirection: "row",
    alignItems: "center",
    flexGrow: 1,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  brandText: {
    marginRight: "auto",
    fontSize: 15,
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSelected,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    marginLeft: Spacing.three,
  },
});
