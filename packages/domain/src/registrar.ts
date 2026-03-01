// SPDX-License-Identifier: Apache-2.0
/**
 * RegistrarProvider interface — abstract registrar layer.
 * NameSilo implements this; other registrars can be added later.
 */

export interface DomainPrice {
  register: number;
  renew?: number; // not returned by checkRegisterAvailability; omitted means unknown
  currency: string;
}

export interface DomainAvailability {
  domain: string;
  available: boolean;
  price?: DomainPrice;
  premium?: boolean;
}

export interface RegistrationResult {
  domain: string;
  orderId: string;
}

export interface NameserverInfo {
  domain: string;
  nameservers: string[];
}

/**
 * Abstract registrar interface. All methods return domain.sh's own types,
 * not registrar-specific shapes.
 *
 * Dependency direction: service.ts → RegistrarProvider ← namesilo.ts
 */
export interface RegistrarProvider {
  /**
   * Check availability and pricing for a list of FQDNs.
   */
  search(domains: string[]): Promise<DomainAvailability[]>;

  /**
   * Purchase a domain. Returns the registrar order ID.
   */
  register(domain: string, years: number): Promise<RegistrationResult>;

  /**
   * Change the authoritative nameservers for a domain.
   */
  setNameservers(domain: string, nameservers: string[]): Promise<void>;

  /**
   * Get the current authoritative nameservers for a domain.
   */
  getNameservers(domain: string): Promise<NameserverInfo>;
}
