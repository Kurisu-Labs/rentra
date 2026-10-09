"use client";

import { createContext, useContext } from "react";
import type { Address } from "viem";

export type Session = {
  ready: boolean;
  authenticated: boolean;
  address?: Address;
  email?: string;
  local: boolean;
  login: () => void;
  logout: () => void;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ value, children }: { value: Session; children: React.ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const value = useContext(SessionContext);
  if (value) return value;
  return {
    ready: false,
    authenticated: false,
    local: false,
    login: () => {},
    logout: () => {},
  };
}
