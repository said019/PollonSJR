"use client";

import { useState, useEffect } from "react";
import { getToken, saveTokens, clearTokens, isAuthenticated } from "@/lib/auth";
import { api } from "@/lib/api";

export function useAuth() {
  const [authenticated, setAuthenticated] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAuthenticated(isAuthenticated());
    setLoading(false);
  }, []);

  /** `cc` = clave de país ("52" México, "1" EE. UU.). Permite que un cliente
   *  con WhatsApp extranjero también reciba su código. */
  async function requestOTP(phone: string, cc: string = "52") {
    const res = await api.post<{ ok: boolean; debugCode?: string }>(
      "/api/auth/request-otp",
      { phone, cc }
    );
    return res;
  }

  async function verifyOTP(
    phone: string,
    code: string,
    cc: string = "52"
  ): Promise<{ isNewCustomer: boolean }> {
    const res = await api.post<{
      ok: boolean;
      accessToken: string;
      refreshToken: string;
      isNewCustomer: boolean;
      customerId: string;
    }>("/api/auth/verify-otp", { phone, code, cc });

    saveTokens(res.accessToken, res.refreshToken);
    setAuthenticated(true);
    setCustomerId(res.customerId);

    return { isNewCustomer: res.isNewCustomer };
  }

  async function saveName(name: string) {
    const token = getToken();
    if (token) {
      await api.put("/api/auth/me", { name }, token);
    }
  }

  async function logout() {
    const token = getToken();
    if (token) {
      await api.post("/api/auth/logout", {}, token).catch(() => {});
    }
    clearTokens();
    setAuthenticated(false);
    setCustomerId(null);
  }

  return {
    authenticated,
    customerId,
    loading,
    requestOTP,
    verifyOTP,
    saveName,
    logout,
  };
}
