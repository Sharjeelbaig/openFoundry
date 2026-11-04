// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

/**
 * The local directory: people, their credentials, and the roles they hold.
 *
 * One file, one model, for every deployment shape. A single-user install is a
 * directory with one principal; an office install is the same directory with
 * more rows. There is no mode switch anywhere in this module.
 */

export const DIRECTORY_VERSION = 1;

export type PrincipalKind = "user" | "service";

export interface Principal {
  id: string;
  kind: PrincipalKind;
  name: string;
  /** Lowercased; unique within the directory. */
  email: string;
  initials: string;
  createdAt: string;
  disabledAt?: string;
}

export type CredentialKind = "access_code" | "machine" | "api_key";

export interface Credential {
  id: string;
  principalId: string;
  kind: CredentialKind;
  /**
   * First characters of an access code, or the literal "machine". Lets
   * sign-in find the row without hashing every credential on every attempt.
   */
  lookup: string;
  salt: string;
  hash: string;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
}

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  actions: string[];
  builtIn: true;
}

export interface Assignment {
  id: string;
  principalId: string;
  roleId: string;
  /** "/" for the whole install, "/projects/<projectId>" for one project. */
  scope: string;
  description?: string;
  createdAt: string;
  createdBy: string;
}

export interface SessionRecord {
  /** sha256 of the cookie value. The cookie itself is never stored. */
  idHash: string;
  principalId: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string;
  address: string;
}

export interface AuditEvent {
  at: string;
  actorId: string | null;
  action: string;
  target: string;
  scope?: string;
  outcome: "allowed" | "denied" | "failed";
  detail?: string;
}

export interface Directory {
  version: number;
  principals: Principal[];
  credentials: Credential[];
  assignments: Assignment[];
  sessions: SessionRecord[];
}

export function emptyDirectory(): Directory {
  return {
    version: DIRECTORY_VERSION,
    principals: [],
    credentials: [],
    assignments: [],
    sessions: [],
  };
}
