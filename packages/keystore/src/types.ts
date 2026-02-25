export interface V3CryptoParams {
  cipher: "aes-128-ctr";
  cipherparams: { iv: string };
  ciphertext: string;
  kdf: "scrypt";
  kdfparams: {
    n: number;
    r: number;
    p: number;
    dklen: number;
    salt: string;
  };
  mac: string;
}

export interface PrimExtension {
  label?: string;
  kdfInput: "device" | "passphrase";
  createdAt: string;
}

export interface KeystoreFile {
  version: 3;
  id: string;
  address: string;
  crypto: V3CryptoParams;
  prim?: PrimExtension;
}

export interface PrimConfig {
  default_wallet?: string;
  network?: string;
}

export interface KeyInfo {
  address: string;
  label?: string;
  createdAt: string;
  isDefault: boolean;
}
