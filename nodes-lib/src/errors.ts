class BaseError<Name extends string, Cause> extends Error {
  name: Name;
  message: string;
  cause?: Cause;

  constructor({
    name, message, cause
  }: {
    name: Name,
    message: string,
    cause?: Cause,
  }) {
    super();
    this.name = name;
    this.message = message;
    this.cause = cause;
  };
};

export class DpidUpdateError extends BaseError<"DPID_UPDATE_ERROR", Error> {};
export class DpidRegistrationError extends BaseError<"DPID_REGISTRATION_ERROR", Error> {};
export class WrongOwnerError extends BaseError<
  "WRONG_OWNER_ERROR", { expected: string, actual: string }
> {};
export class NoSuchEntryError extends BaseError<"NO_SUCH_ENTRY_ERROR", Error> {};
