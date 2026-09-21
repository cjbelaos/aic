// Shared runtime error contract for the Service Reports module.
// HTTP mapping mirrors Sales Orders: 400 malformed, 401 unauthenticated,
// 403 forbidden, 404 missing, 409 conflict (version/idempotency/duplicate),
// 422 business validation, 503 dependency/busy. Pure module for tests.

export type ServiceReportErrorCode =
  | "MALFORMED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "COMMAND_REPLAY"
  | "DUPLICATE"
  | "VALIDATION"
  | "DEPENDENCY_UNAVAILABLE"
  | "GATEWAY_BUSY";

export interface ServiceReportErrorBody {
  code: ServiceReportErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
  currentVersion?: number;
  retryable?: boolean;
}

export class ServiceReportError extends Error {
  readonly status: number;
  readonly errorCode: ServiceReportErrorCode;
  readonly fieldErrors?: Record<string, string>;
  readonly currentVersion?: number;
  readonly retryable: boolean;

  constructor(body: ServiceReportErrorBody, status: number) {
    super(body.message);
    this.name = "ServiceReportError";
    this.status = status;
    this.errorCode = body.code;
    this.fieldErrors = body.fieldErrors;
    this.currentVersion = body.currentVersion;
    this.retryable = body.retryable ?? false;
  }

  toBody(): ServiceReportErrorBody {
    return {
      code: this.errorCode,
      message: this.message,
      ...(this.fieldErrors ? { fieldErrors: this.fieldErrors } : {}),
      ...(this.currentVersion !== undefined ? { currentVersion: this.currentVersion } : {}),
      ...(this.retryable ? { retryable: true } : {}),
    };
  }
}

export function badRequest(message: string, fieldErrors?: Record<string, string>): ServiceReportError {
  return new ServiceReportError({ code: "MALFORMED", message, ...(fieldErrors ? { fieldErrors } : {}) }, 400);
}

export function notFound(message: string): ServiceReportError {
  return new ServiceReportError({ code: "NOT_FOUND", message }, 404);
}

export function versionConflict(message: string, currentVersion: number): ServiceReportError {
  return new ServiceReportError({ code: "VERSION_CONFLICT", message, currentVersion }, 409);
}

export function commandReplay(message: string): ServiceReportError {
  return new ServiceReportError({ code: "COMMAND_REPLAY", message }, 409);
}

export function duplicate(message: string, fieldErrors?: Record<string, string>): ServiceReportError {
  return new ServiceReportError({ code: "DUPLICATE", message, ...(fieldErrors ? { fieldErrors } : {}) }, 409);
}

export function validationError(message: string, fieldErrors?: Record<string, string>): ServiceReportError {
  return new ServiceReportError({ code: "VALIDATION", message, ...(fieldErrors ? { fieldErrors } : {}) }, 422);
}

export function forbidden(message: string): ServiceReportError {
  return new ServiceReportError({ code: "FORBIDDEN", message }, 403);
}

export function dependencyUnavailable(message: string): ServiceReportError {
  return new ServiceReportError({ code: "DEPENDENCY_UNAVAILABLE", message, retryable: true }, 503);
}
export function gatewayBusy(message: string): ServiceReportError {
  return new ServiceReportError({ code: "GATEWAY_BUSY", message, retryable: true }, 503);
}
