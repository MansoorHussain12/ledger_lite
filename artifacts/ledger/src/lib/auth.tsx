import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe, useLogin, useLogout, getGetMeQueryKey } from "@workspace/api-client-react";

interface AuthUser {
  id: number;
  name: string;
  username: string;
  role: "owner" | "salesman" | "cashier";
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  // Track whether the initial auth check has resolved.
  // After that, errors from background refetches must NOT clear the user —
  // they could be transient network blips, not real logouts.
  const initialCheckDone = useRef(false);

  const { data: meData, isLoading: meLoading } = useGetMe({
    query: { retry: false, queryKey: getGetMeQueryKey() }
  });

  const loginMutation = useLogin();
  const logoutMutation = useLogout();

  useEffect(() => {
    if (meLoading) return;

    if (meData) {
      setUser(meData as AuthUser);
    } else if (!initialCheckDone.current) {
      // Only clear user on the very first check (not authenticated on load).
      // Subsequent failed refetches (e.g. network blip) should not force logout.
      setUser(null);
    }

    initialCheckDone.current = true;
    setLoading(false);
  }, [meData, meLoading]);

  const login = async (username: string, password: string) => {
    const result = await loginMutation.mutateAsync({ data: { username, password } });
    // Set user directly from the login response — no need to refetch /auth/me.
    // Triggering invalidateQueries here would cause a background refetch that
    // could race against the session cookie arriving and force an unexpected logout.
    setUser(result as AuthUser);
    initialCheckDone.current = true;
    setLoading(false);
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
    initialCheckDone.current = false;
    setUser(null);
    queryClient.clear();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
