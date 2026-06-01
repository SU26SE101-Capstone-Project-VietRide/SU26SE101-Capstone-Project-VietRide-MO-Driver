import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useColorScheme } from "react-native";

import { Colors } from "@/constants/theme";

type TabVariant = "driver" | "assistant";

const TAB_CONFIG = {
  driver: [
    {
      name: "index",
      label: "Tổng quan",
      sf: "rectangle.grid.2x2",
      md: "dashboard",
    },
    { name: "trip", label: "Chuyến", sf: "map", md: "map" },
    {
      name: "incident",
      label: "Sự cố",
      sf: "exclamationmark.triangle",
      md: "warning",
    },
    {
      name: "support",
      label: "Hỗ trợ",
      sf: "person.crop.circle.badge.questionmark",
      md: "support_agent",
    },
    {
      name: "settings",
      label: "Cài đặt",
      sf: "gearshape",
      md: "settings",
    },
  ],
  assistant: [
    {
      name: "index",
      label: "Tổng quan",
      sf: "rectangle.grid.2x2",
      md: "dashboard",
    },
    { name: "boarding", label: "Boarding", sf: "person.3", md: "group" },
    { name: "cargo", label: "Hàng hóa", sf: "shippingbox", md: "inventory_2" },
    {
      name: "stops",
      label: "Điểm dừng",
      sf: "mappin.and.ellipse",
      md: "location_on",
    },
    {
      name: "support",
      label: "Hỗ trợ",
      sf: "person.crop.circle.badge.questionmark",
      md: "support_agent",
    },
    {
      name: "settings",
      label: "Cài đặt",
      sf: "gearshape",
      md: "settings",
    },
  ],
} as const;

type AppTabsProps = {
  variant: TabVariant;
};

export default function AppTabs({ variant }: AppTabsProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "unspecified" ? "light" : scheme];
  const tabs = TAB_CONFIG[variant];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.primary}
      labelStyle={{ selected: { color: colors.text } }}
    >
      {tabs.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={tab.sf} md={tab.md} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
