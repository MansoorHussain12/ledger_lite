import { createContext, useContext, useEffect, useState } from "react";
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

  const { data: meData, isLoading: meLoading, isError: meError } = useGetMe({
    query: { retry: false, queryKey: getGetMeQueryKey() }
  });

  const loginMutation = useLogin();
  const logoutMutation = useLogout();

  useEffect(() => {
    if (!meLoading) {
      if (meData && !meError) {
        setUser(meData as AuthUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    }
  }, [meData, meLoading, meError]);

  const login = async (username: string, password: string) => {
    const result = await loginMutation.mutateAsync({ data: { username, password } });
    setUser(result as AuthUser);
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
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
