"use client";

import { useAuthStore } from "@/stores/auth-store";
import { useRouter } from "next/navigation";
import { isPlatformControlHost } from "@restai/config";

export function useAuth() {
  const {
    user,
    accessToken,
    setAuth,
    logout: clearAuth,
    isAuthenticated,
    selectedBranchId,
    setSelectedBranch,
  } = useAuthStore();
  const router = useRouter();

  const login = async (email: string, password: string) => {
    const tenantHost =
      typeof window !== "undefined" ? window.location.host : "";
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/auth/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(tenantHost ? { "x-tenant-host": tenantHost } : {}),
        },
        body: JSON.stringify({ email, password }),
      }
    );
    const data = await res.json();
    if (!data.success)
      throw new Error(data.error?.message || "Erro ao entrar");
    setAuth(data.data.user, data.data.accessToken, data.data.refreshToken);
    if (data.data.user.branches?.length > 0) {
      setSelectedBranch(data.data.user.branches[0]);
    }
    const onControl =
      typeof window !== "undefined" &&
      isPlatformControlHost(window.location.hostname);
    if (data.data.user.role === "super_admin" || onControl) {
      router.push("/super-admin");
    } else {
      router.push("/orders");
    }
  };

  const register = async (input: {
    organizationName: string;
    slug: string;
    email: string;
    password: string;
    name: string;
  }) => {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/auth/register`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }
    );
    const data = await res.json();
    if (!data.success)
      throw new Error(data.error?.message || "Erro ao cadastrar");
    setAuth(data.data.user, data.data.accessToken, data.data.refreshToken);
    router.push("/orders");
  };

  const logout = () => {
    clearAuth();
    router.push("/login");
  };

  return {
    user,
    accessToken,
    selectedBranchId,
    setSelectedBranch,
    login,
    register,
    logout,
    isAuthenticated: isAuthenticated(),
  };
}
