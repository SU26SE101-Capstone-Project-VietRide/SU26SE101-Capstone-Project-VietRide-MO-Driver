import { Redirect } from "expo-router";

import AppTabs from "@/components/app-tabs";
import {
    getHomeHrefForRole,
    useSession,
} from "@/features/session/session-context";

export default function DriverLayout() {
  const { isAuthenticated, role } = useSession();

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  if (role !== "DRIVER") {
    return <Redirect href={getHomeHrefForRole(role)} />;
  }

  return <AppTabs variant="driver" />;
}
