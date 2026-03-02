"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { ccc } from "@ckb-ccc/connector-react";

interface AuthContextValue {
  walletAddress: string | null;
  isConnected: boolean;
  isLoading: boolean;
  connect: () => void;
  disconnect: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  walletAddress: null,
  isConnected: false,
  isLoading: false,
  connect: () => {},
  disconnect: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { open, disconnect: cccDisconnect } = ccc.useCcc();
  const signer = ccc.useSigner();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Watch for signer changes (wallet connect/disconnect)
  useEffect(() => {
    if (!signer) {
      // Wallet disconnected
      setWalletAddress(null);
      // Clear the session cookie
      fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
      return;
    }

    // Wallet connected - get address
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const address = await signer.getRecommendedAddress();
        if (cancelled) return;
        setWalletAddress(address);

        // Notify the server to upsert user and set session cookie
        await fetch("/api/auth/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: address }),
        });
      } catch (error) {
        console.error("Failed to get wallet address:", error);
        if (!cancelled) {
          setWalletAddress(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signer]);

  const connect = useCallback(() => {
    open();
  }, [open]);

  const disconnect = useCallback(() => {
    cccDisconnect();
    setWalletAddress(null);
    fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
  }, [cccDisconnect]);

  return (
    <AuthContext.Provider
      value={{
        walletAddress,
        isConnected: !!walletAddress,
        isLoading,
        connect,
        disconnect,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
