"use client";

import { ccc } from "@ckb-ccc/connector-react";
import { ReactNode, useMemo } from "react";

export function CccProvider({ children }: { children: ReactNode }) {
  const defaultClient = useMemo(() => new ccc.ClientPublicTestnet(), []);

  return (
    <ccc.Provider
      defaultClient={defaultClient}
      clientOptions={[
        { name: "CKB Testnet", client: new ccc.ClientPublicTestnet() },
        { name: "CKB Mainnet", client: new ccc.ClientPublicMainnet() },
      ]}
    >
      {children}
    </ccc.Provider>
  );
}
