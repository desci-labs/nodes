

export class BaseError<T extends string> extends Error {
  name: T;
  message: string;
  cause: any;

  constructor({
    name, message, cause
  }: {
    name: T,
    message: string,
    cause?: any,
  }) {
    super();
    this.name = name;
    this.message = message;
    this.cause = cause;
  };
};

export class PublishError extends BaseError<"DPID_PUBLISH_ERROR"> {};
