// Shared runtime error contract for the Sales Orders module.
// HTTP mapping: 400 malformed input, 401 unauthenticated, 403 forbidden,
// 404 missing, 409 conflict (version/idempotency), 422 business validation,
// 503 dependency/busy failure. Kept free of imports so native-TypeScript
// tests can import it directly.

export type SalesOrderErrorCode =
  | "MALFORMED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "COMMAND_REPLAY"
  | "VALIDATION"
  | "GATEWAY_BUSY"
  | "DEPENDENCY_UNAVAILABLE"
  | "PERMISSION_DENIED"
  | "GATEWAY_NOT_CONFIGURED";

export interface SalesOrderErrorBody {
  code: SalesOrderErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
  currentVersion?: number;
  retryable?: boolean;
}

export class SalesOrderError extends Error {
  readonly status: number;
  readonly errorCode: SalesOrderErrorCode;
  readonly fieldErrors?: Record<string, string>;
  readonly currentVersion?: number;
  readonly retryable: boolean;

  constructor(body: SalesOrderErrorBody, status: number) {
    super(body.message);
    this.name = "SalesOrderError";
    this.status = status;
    this.errorCode = body.code;
    this.fieldErrors = body.fieldErrors;
    this.currentVersion = body.currentVersion;
    this.retryable = body.retryable ?? false;
  }

  toBody(): SalesOrderErrorBody {
    return {
      code: this.errorCode,
      message: this.message,
      ...(this.fieldErrors ? { fieldErrors: this.fieldErrors } : {}),
      ...(this.currentVersion !== undefined ? { currentVersion: this.currentVersion } : {}),
      ...(this.retryable ? { retryable: true } : {}),
    };
  }
}

export function badRequest(message: string, fieldErrors?: Record<string, string>): SalesOrderError {
  return new SalesOrderError({ code: "MALFORMED", message, ...(fieldErrors ? { fieldErrors } : {}) }, 400);
}

export function notFound(message: string): SalesOrderError {
  return new SalesOrderError({ code: "NOT_FOUND", message }, 404);
}

export function versionConflict(message: string, currentVersion: number): SalesOrderError {
  return new SalesOrderError({ code: "VERSION_CONFLICT", message, currentVersion }, 409);
}

export function commandReplay(message: string): SalesOrderError {
  return new SalesOrderError({ code: "COMMAND_REPLAY", message }, 409);
}

export function validationError(message: string, fieldErrors?: Record<string, string>): SalesOrderError {
  return new SalesOrderError({ code: "VALIDATION", message, ...(fieldErrors ? { fieldErrors } : {}) }, 422);
}

export function forbidden(message: string): SalesOrderError {
  return new SalesOrderError({ code: "FORBIDDEN", message }, 403);
}

export function dependencyUnavailable(message: string): SalesOrderError {
  return new SalesOrderError({ code: "DEPENDENCY_UNAVAILABLE", message, retryable: true }, 503);
}

export function gatewayBusy(message: string): SalesOrderError {
  return new SalesOrderError({ code: "GATEWAY_BUSY", message, retryable: true }, 503);
}