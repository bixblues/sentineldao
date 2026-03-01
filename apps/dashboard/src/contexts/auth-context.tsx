"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface User {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "pro" | "enterprise";
  status: "active" | "suspended" | "trial";
}

interface Membership {
  role: "owner" | "admin" | "operator" | "viewer";
}

interface AuthContextType {
  user: User | null;
  tenant: Tenant | null;
  membership: Membership | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    name: string,
    organizationName: string,
  ) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load token from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem("sentinel_token");
    if (storedToken) {
      setToken(storedToken);
      refreshAuth(storedToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  const refreshAuth = async (authToken?: string) => {
    const tkn = authToken || token;
    if (!tkn) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("http://localhost:3001/api/auth/me", {
        headers: {
          Authorization: `Bearer ${tkn}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch user");
      }

      const data = await response.json();
      setUser(data.user);
      setTenant(data.tenant);
      setMembership(data.membership);
    } catch (err) {
      console.error("[Auth] Failed to refresh auth:", err);
      // Clear invalid token
      localStorage.removeItem("sentinel_token");
      setToken(null);
      setUser(null);
      setTenant(null);
      setMembership(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await fetch("http://localhost:3001/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Login failed");
    }

    const data = await response.json();
    setToken(data.token);
    setUser(data.user);
    setTenant(data.tenant);
    setMembership(data.membership);
    localStorage.setItem("sentinel_token", data.token);
  };

  const register = async (
    email: string,
    password: string,
    name: string,
    organizationName: string,
  ) => {
    const response = await fetch("http://localhost:3001/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name, organizationName }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Registration failed");
    }

    const data = await response.json();
    setToken(data.token);
    setUser(data.user);
    setTenant(data.tenant);
    setMembership({ role: "owner" });
    localStorage.setItem("sentinel_token", data.token);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setTenant(null);
    setMembership(null);
    localStorage.removeItem("sentinel_token");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        membership,
        token,
        isLoading,
        login,
        register,
        logout,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
