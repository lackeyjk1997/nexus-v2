/**
 * CrmAdapter error hierarchy. Callers distinguish behavior by subclass, not by
 * message inspection. Every thrown error is an instance of CrmAdapterError.
 *
 * See DECISIONS.md 2.18, 07B Section 2 for semantics.
 */

export class CrmAdapterError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** 404 from the CRM. Caller decides whether to surface or treat as upstream-deleted. */
export class CrmNotFoundError extends CrmAdapterError {
  constructor(
    public readonly objectType: string,
    public readonly objectId: string,
    cause?: unknown,
  ) {
    super(`${objectType} ${objectId} not found`, cause);
  }
}

/** 401/403. Credentials invalid, scope missing, or token revoked. */
export class CrmAuthError extends CrmAdapterError {}

/** 429. Caller respects retryAfterSeconds; background jobs exponential-backoff. */
export class CrmRateLimitError extends CrmAdapterError {
  constructor(
    message: string,
    public readonly retryAfterSeconds: number,
    cause?: unknown,
  ) {
    super(message, cause);
  }
}

/** 400. Request body invalid; caller surfaces to UI as validation error. */
export class CrmValidationError extends CrmAdapterError {}

/** 5xx or network. Caller retries up to 3x with backoff. */
export class CrmTransientError extends CrmAdapterError {}

/** Thrown when a configured method is intentionally not implemented in this phase. */
export class CrmNotImplementedError extends CrmAdapterError {
  constructor(methodName: string, expectedPhase: string) {
    super(
      `CrmAdapter.${methodName} not_implemented (lands in ${expectedPhase})`,
    );
  }
}
