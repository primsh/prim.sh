/**
 * CloudProvider interface — abstracts cloud compute providers (Hetzner, DigitalOcean, AWS, etc.)
 * Each provider implements this contract; the service layer is provider-agnostic.
 */

// ─── Provider error ──────────────────────────────────────────────────────

export class ProviderError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

// ─── Provider response types ─────────────────────────────────────────────

export interface ProviderServer {
  providerResourceId: string;
  name: string;
  status: string;
  ipv4: string | null;
  ipv6: string | null;
  type: string;
  image: string | null;
  location: string;
}

export interface ProviderAction {
  id: string;
  command: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
}

export interface ProviderCreateResult {
  server: ProviderServer;
  action: ProviderAction;
}

export interface ProviderRebuildResult {
  action: ProviderAction;
  rootPassword: string | null;
}

export interface ProviderSshKey {
  providerResourceId: string;
  name: string;
  fingerprint: string;
  publicKey: string;
}

// ─── Provider request types ──────────────────────────────────────────────

export interface ProviderCreateParams {
  name: string;
  type: string;
  image: string;
  location: string;
  sshKeyIds?: string[];
  labels?: Record<string, string>;
  userData?: string;
}

export interface ProviderSshKeyParams {
  name: string;
  publicKey: string;
  labels?: Record<string, string>;
}

// ─── Provider capabilities ───────────────────────────────────────────────

export interface ProviderServerType {
  name: string;
  providerType: string;
  dailyBurn: string;
}

// ─── CloudProvider interface ─────────────────────────────────────────────

export interface CloudProvider {
  readonly name: string;

  // Server lifecycle
  createServer(params: ProviderCreateParams): Promise<ProviderCreateResult>;
  getServer(providerResourceId: string): Promise<ProviderServer>;
  deleteServer(providerResourceId: string): Promise<void>;
  startServer(providerResourceId: string): Promise<ProviderAction>;
  stopServer(providerResourceId: string): Promise<ProviderAction>;
  rebootServer(providerResourceId: string): Promise<ProviderAction>;
  resizeServer(
    providerResourceId: string,
    type: string,
    upgradeDisk: boolean,
  ): Promise<ProviderAction>;
  rebuildServer(providerResourceId: string, image: string): Promise<ProviderRebuildResult>;

  // SSH keys
  createSshKey(params: ProviderSshKeyParams): Promise<ProviderSshKey>;
  listSshKeys(labelSelector?: string): Promise<ProviderSshKey[]>;
  deleteSshKey(providerResourceId: string): Promise<void>;

  // Capabilities
  serverTypes(): ProviderServerType[];
  images(): string[];
  locations(): string[];
}
