import { Redirect } from "expo-router";

import {
    getHomeHrefForRole,
    useSession,
} from "@/features/session/session-context";

export default function RootIndexRedirect() {
  const { role } = useSession();

  return <Redirect href={getHomeHrefForRole(role)} />;
}
