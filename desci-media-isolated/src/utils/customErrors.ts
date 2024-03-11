import crypto from 'crypto';

export class BaseError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;

    // Restores the prototype chain
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends BaseError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

export class BadRequestError extends BaseError {
  constructor(message = 'Bad request') {
    super(message, 400);
  }
}

export class UnhandledError extends BaseError {
  constructor(message = `Unhandled error occured, error reference: ${crypto.randomUUID()}`) {
    super(message, 500);
  }
}

export class InternalServerError extends BaseError {
  constructor(message = 'Internal server error') {
    super(message, 500);
  }
}

export class IpfsConfigurationError extends BaseError {
  constructor(message = 'IPFS Misconfigured') {
    super(message, 500);
  }
}

export class IpfsFetchError extends BaseError {
  constructor(message = 'Failed to retrieve file from IPFS') {
    super(message, 502);
  }
}
