import type { LocalAccount } from "viem";

export interface CreatePrimFetchConfig {
  /** Raw hex private key (0x-prefixed). Mutually exclusive with `signer`. */
  privateKey?: `0x${string}`;
  /** viem LocalAccount instance (has signTypedData). Mutually exclusive with `privateKey`. */
  signer?: LocalAccount;
  /**
   * Load signing key from ~/.prim/keys/ keystore.
   * - `true`: load default wallet
   * - `{ address, passphrase }`: load specific wallet with optional passphrase
   */
  keystore?: boolean | { address?: string; passphrase?: string };
  /** Max USDC to pay per request. Default "1.00". */
  maxPayment?: string;
  /** Network override. Default: PRIM_NETWORK env or "eip155:8453". */
  network?: string;
}
