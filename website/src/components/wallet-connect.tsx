"use client";

import { useState, useEffect } from "react";
import { Wallet, LogOut, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";
import { ccc } from "@ckb-ccc/connector-react";

function truncateAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

export function WalletConnect({ className }: { className?: string }) {
  const { walletAddress, isConnected, isLoading, connect, disconnect } =
    useAuth();
  const signer = ccc.useSigner();
  const [balance, setBalance] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch balance when connected
  useEffect(() => {
    if (!signer || !isConnected) {
      setBalance(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const capacity = await signer.getBalance();
        if (!cancelled) {
          setBalance(ccc.fixedPointToString(capacity));
        }
      } catch (error) {
        console.error("Failed to fetch balance:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signer, isConnected]);

  const handleCopyAddress = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error("Failed to copy address");
    }
  };

  if (!isConnected) {
    return (
      <Button
        size="sm"
        className={`gap-2 ${className ?? ""}`}
        onClick={connect}
        disabled={isLoading}
      >
        <Wallet className="size-4" />
        {isLoading ? "Connecting..." : "Connect Wallet"}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={`gap-2 ${className ?? ""}`}>
          <Wallet className="size-4 text-primary" />
          <span className="font-mono text-xs">
            {truncateAddress(walletAddress!)}
          </span>
          {balance !== null && (
            <Badge variant="secondary" className="ml-1 text-xs font-normal">
              {Number(balance).toFixed(2)} CKB
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="text-xs text-muted-foreground">Connected Wallet</p>
          <p className="mt-0.5 break-all font-mono text-xs">
            {walletAddress}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCopyAddress}>
          {copied ? (
            <Check className="mr-2 size-4 text-green-500" />
          ) : (
            <Copy className="mr-2 size-4" />
          )}
          {copied ? "Copied!" : "Copy Address"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={disconnect} className="text-destructive">
          <LogOut className="mr-2 size-4" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
