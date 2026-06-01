import {
    createContext,
    useContext,
    useMemo,
    useState,
    type PropsWithChildren,
} from "react";

import { type CrewRole } from "@/features/operations/mock-data";

export type CrewSession = {
  crewId: string;
  displayName: string;
  operatorName: string;
  role: CrewRole;
};

export type SampleCrewAccount = CrewSession & {
  accountId: string;
  email: string;
  password: string;
};

type LoginResult =
  | { ok: true; session: CrewSession }
  | { error: string; ok: false };

type SessionContextValue = {
  accounts: SampleCrewAccount[];
  isAuthenticated: boolean;
  login: (email: string, password: string) => LoginResult;
  loginAs: (accountId: string) => CrewSession | null;
  logout: () => void;
  role: CrewRole | null;
  session: CrewSession | null;
};

export const SAMPLE_CREW_ACCOUNTS: SampleCrewAccount[] = [
  {
    accountId: "driver-minh-quan",
    crewId: "crew-driver-01",
    displayName: "Tài xế Minh Quân",
    email: "driver.minhquan@vietride.vn",
    operatorName: "VietRide Lines",
    password: "Driver@123",
    role: "DRIVER",
  },
  {
    accountId: "assistant-tuan-kiet",
    crewId: "crew-assistant-01",
    displayName: "Phụ xe Tuấn Kiệt",
    email: "assistant.tuankiet@vietride.vn",
    operatorName: "VietRide Lines",
    password: "Assistant@123",
    role: "ASSISTANT",
  },
  {
    accountId: "driver-thanh-lam",
    crewId: "crew-driver-02",
    displayName: "Tài xế Thành Lâm",
    email: "driver.thanhlam@vietride.vn",
    operatorName: "VietRide Express",
    password: "Driver@123",
    role: "DRIVER",
  },
  {
    accountId: "assistant-ngoc-an",
    crewId: "crew-assistant-02",
    displayName: "Phụ xe Ngọc An",
    email: "assistant.ngocan@vietride.vn",
    operatorName: "VietRide Express",
    password: "Assistant@123",
    role: "ASSISTANT",
  },
];

const DEFAULT_ROLE: CrewRole | null =
  process.env.EXPO_PUBLIC_CREW_ROLE === "ASSISTANT"
    ? "ASSISTANT"
    : process.env.EXPO_PUBLIC_CREW_ROLE === "DRIVER"
      ? "DRIVER"
      : null;

const DEFAULT_ACCOUNT_BY_ROLE: Record<CrewRole, SampleCrewAccount> = {
  DRIVER: {
    accountId: "driver-minh-quan",
    crewId: "crew-driver-01",
    displayName: "Tài xế Minh Quân",
    email: "driver.minhquan@vietride.vn",
    operatorName: "VietRide Lines",
    password: "Driver@123",
    role: "DRIVER",
  },
  ASSISTANT: {
    accountId: "assistant-tuan-kiet",
    crewId: "crew-assistant-01",
    displayName: "Phụ xe Tuấn Kiệt",
    email: "assistant.tuankiet@vietride.vn",
    operatorName: "VietRide Lines",
    password: "Assistant@123",
    role: "ASSISTANT",
  },
};

function toSession(account: SampleCrewAccount): CrewSession {
  return {
    crewId: account.crewId,
    displayName: account.displayName,
    operatorName: account.operatorName,
    role: account.role,
  };
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<CrewSession | null>(() =>
    DEFAULT_ROLE ? toSession(DEFAULT_ACCOUNT_BY_ROLE[DEFAULT_ROLE]) : null,
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      accounts: SAMPLE_CREW_ACCOUNTS,
      isAuthenticated: session !== null,
      login: (email, password) => {
        const normalizedEmail = email.trim().toLowerCase();
        const matchedAccount = SAMPLE_CREW_ACCOUNTS.find(
          (account) =>
            account.email.toLowerCase() === normalizedEmail &&
            account.password === password,
        );

        if (!matchedAccount) {
          return {
            error: "Email hoặc mật khẩu không đúng với tài khoản mẫu.",
            ok: false,
          };
        }

        const nextSession = toSession(matchedAccount);
        setSession(nextSession);

        return { ok: true, session: nextSession };
      },
      loginAs: (accountId) => {
        const matchedAccount = SAMPLE_CREW_ACCOUNTS.find(
          (account) => account.accountId === accountId,
        );

        if (!matchedAccount) {
          return null;
        }

        const nextSession = toSession(matchedAccount);
        setSession(nextSession);
        return nextSession;
      },
      logout: () => setSession(null),
      role: session?.role ?? null,
      session,
    }),
    [session],
  );

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const session = useContext(SessionContext);

  if (!session) {
    throw new Error("useSession must be used within SessionProvider");
  }

  return session;
}

export function useAuthenticatedSession() {
  const context = useSession();

  if (!context.session) {
    throw new Error("useAuthenticatedSession requires an active session");
  }

  return {
    ...context,
    ...context.session,
    role: context.session.role,
    session: context.session,
  };
}

export function getHomeHrefForRole(role: CrewRole | null) {
  if (!role) {
    return "/login";
  }

  return role === "DRIVER" ? "/driver" : "/assistant";
}
