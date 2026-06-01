import { Redirect } from "expo-router";

import AppTabs from "@/components/app-tabs";
import {
    getHomeHrefForRole,
    useSession,
} from "@/features/session/session-context";

export default function AssistantLayout() {
  const { isAuthenticated, role } = useSession();

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  if (role !== "ASSISTANT") {
    return <Redirect href={getHomeHrefForRole(role)} />;
  }

  return <AppTabs variant="assistant" />;
}
