// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";

/** A shared-store HTTP call failed with a status the caller can preserve. */
export class ResponseStoreHttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode: number, code = "store_error") {
    super(message);
    this.name = "ResponseStoreHttpError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** A tenant exceeded its response-count or payload-byte quota. */
export class ResponseStoreQuotaError extends ResponseStoreHttpError {
  constructor(message: string, statusCode: number) {
    super(message, statusCode, "quota_exceeded");
    this.name = "ResponseStoreQuotaError";
  }
}
