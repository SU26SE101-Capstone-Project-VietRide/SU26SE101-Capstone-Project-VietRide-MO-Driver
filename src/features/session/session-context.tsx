import { useQueryClient } from "@tanstack/react-query";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type PropsWithChildren,
} from "react";

import {
    bootstrapSession,
    login as apiLogin,
    logout as apiLogout,
} from "@/api/auth";
import { setOnSessionExpired } from "@/api/client";

import { authErrorMessage } from "./auth-errors";
import type { AuthUser } from "@/api/types";
import { type CrewRole } from "@/features/operations/mock-data";
import {
    registerPushToken,
    unregisterPushToken,
} from "@/features/notifications/push";

export type CrewSession = {
  crewId: string;
  displayName: string;
  operatorName: string;
  role: CrewRole;
};

export type SessionStatus = "loading" | "signedIn" | "signedOut";

type LoginResult =
  | { ok: true; session: CrewSession }
  | { error: string; ok: false };

type SessionContextValue = {
  status: SessionStatus;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  role: CrewRole | null;
  session: CrewSession | null;
};

// Backend chỉ khai role: string (không enum) → map linh hoạt theo từ khóa.
function mapRole(role: string | null | undefined): CrewRole | null {
  const normalized = (role ?? "").toLowerCase();

  if (normalized.includes("driver")) {
    return "DRIVER";
  }

  if (
    normalized.includes("assistant") ||
    normalized.includes("attendant") ||
    normalized.includes("crew")
  ) {
    return "ASSISTANT";
  }

  return null;
}

function toSession(user: AuthUser): CrewSession | null {
  const role = mapRole(user.role);

  if (!role) {
    return null;
  }

  return {
    crewId: user.id,
    displayName: user.displayName ?? user.email ?? "Nhân sự VietRide",
    // API không trả tên nhà xe (chỉ operatorId) — hiển thị nhãn chung.
    operatorName: user.operatorId ? "Nhà xe VietRide" : "",
    role,
  };
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [session, setSession] = useState<CrewSession | null>(null);

  // Khôi phục phiên từ refresh token lúc mở app.
  useEffect(() => {
    let cancelled = false;

    bootstrapSession()
      .then((user) => {
        if (cancelled) {
          return;
        }

        const nextSession = user ? toSession(user) : null;
        setSession(nextSession);
        setStatus(nextSession ? "signedIn" : "signedOut");

        // Khôi phục phiên thành công → đăng ký lại device token (best-effort).
        if (nextSession) {
          void registerPushToken();
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSession(null);
          setStatus("signedOut");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh fail giữa phiên → client báo về đây để đá ra màn login.
  useEffect(() => {
    setOnSessionExpired(() => {
      setSession(null);
      setStatus("signedOut");
      queryClient.clear();
    });

    return () => setOnSessionExpired(null);
  }, [queryClient]);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      try {
        const data = await apiLogin(email, password);
        const nextSession = toSession(data.user);

        if (!nextSession) {
          await apiLogout();
          return {
            ok: false,
            error:
              "Tài khoản này không thuộc app Tài xế/Phụ xe. Vui lòng dùng tài khoản do nhà xe cấp.",
          };
        }

        queryClient.clear();
        setSession(nextSession);
        setStatus("signedIn");
        // Đăng ký device token nhận push (best-effort, không chặn đăng nhập).
        void registerPushToken();
        return { ok: true, session: nextSession };
      } catch (error) {
        // authErrorMessage map mã lỗi sang tiếng Việt — message thô của
        // backend là tiếng Anh, không hiển thị.
        return { ok: false, error: authErrorMessage(error) };
      }
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    // Gỡ device token TRƯỚC khi apiLogout xóa access token (API cần auth).
    await unregisterPushToken();
    await apiLogout();
    queryClient.clear();
    setSession(null);
    setStatus("signedOut");
  }, [queryClient]);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      isAuthenticated: session !== null,
      login,
      logout,
      role: session?.role ?? null,
      session,
    }),
    [status, session, login, logout],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
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
