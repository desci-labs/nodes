type PublishErrorType =
  | { type: "DPID_UPDATE_FAILED"; cause: Error }
  | { type: "DPID_REGISTRATION_FAILED"; cause: Error }
  | { type: "WRONG_OWNER"; cause: { expected: string; actual: string } }
  | { type: "NO_SUCH_ENTRY"; cause?: Error }
  | { type: "CHAIN_CALL"; cause: Error }
  | { type: "CERAMIC_WRITE"; cause: Error }
  | { type: "BACKEND_CALL"; cause: Error }
  | { type: "ALIAS_REGISTRATION"; cause: Error }
  | { type: "DPID_UPGRADE"; cause: Error };

export class PublishError extends Error {
  constructor(message: string, public details: PublishErrorType) {
    super(message);
    this.name = "PublishError";
  }

  static dpidUpdate(message: string, cause: Error) {
    return new PublishError(message, { type: "DPID_UPDATE_FAILED", cause });
  }

  static dpidRegistration(message: string, cause: Error) {
    return new PublishError(message, {
      type: "DPID_REGISTRATION_FAILED",
      cause,
    });
  }

  static wrongOwner(message: string, expected: string, actual: string) {
    return new PublishError(message, {
      type: "WRONG_OWNER",
      cause: { expected, actual },
    });
  }

  static noLegacyMatch(message: string, cause?: Error) {
    return new PublishError(message, { type: "NO_SUCH_ENTRY", cause });
  }

  static chainCall(message: string, cause: Error) {
    return new PublishError(message, { type: "CHAIN_CALL", cause });
  }

  static ceramicWrite(message: string, cause: Error) {
    return new PublishError(message, { type: "CERAMIC_WRITE", cause });
  }

  static backendCall(message: string, cause: Error) {
    return new PublishError(message, { type: "BACKEND_CALL", cause });
  }

  static aliasRegistration(message: string, cause: Error) {
    return new PublishError(message, { type: "ALIAS_REGISTRATION", cause });
  }

  static dpidUpgrade(message: string, cause: Error) {
    return new PublishError(message, { type: "DPID_UPGRADE", cause });
  }
}
