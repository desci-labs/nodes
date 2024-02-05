export enum ErrorType {
  UNAUTHORIZED = 'NoAccessError',
  NOT_FOUND = 'NotFoundError',
  NO_DATA = 'NotDataError',
  DUPLICATE = 'DuplicateDataError',
  OPERATION_FAILED = 'ForbiddenError',
}

export abstract class AttestationError extends Error {
  constructor(
    public type: ErrorType,
    public message: string = 'error',
  ) {
    super(type);
  }
}

export class AttestationNotFoundError extends AttestationError {
  constructor(message = 'Attestation Not Found') {
    super(ErrorType.NOT_FOUND, message);
  }
}

export class AttestationVersionNotFoundError extends AttestationError {
  constructor(message = 'Attestation Version Not Found') {
    super(ErrorType.NOT_FOUND, message);
  }
}

export class CommunityNotFoundError extends AttestationError {
  constructor(message = 'Community Not Found') {
    super(ErrorType.NOT_FOUND, message);
  }
}

export class NoAccessError extends AttestationError {
  constructor(message = 'UnAuthorized access') {
    super(ErrorType.UNAUTHORIZED, message);
  }
}

export class DuplicateDataError extends AttestationError {
  constructor(message = 'Entity already exists') {
    super(ErrorType.DUPLICATE, message);
  }
}

export class DuplicateClaimError extends AttestationError {
  constructor(message = 'Claim already exists') {
    super(ErrorType.DUPLICATE, message);
  }
}

export class ClaimError extends AttestationError {
  constructor(message = 'Claim error') {
    super(ErrorType.OPERATION_FAILED, message);
  }
}

export class ClaimNotFoundError extends AttestationError {
  constructor(message = 'Claim not found') {
    super(ErrorType.NOT_FOUND, message);
  }
}

export class VerificationNotFoundError extends AttestationError {
  constructor(message = 'Verification not found') {
    super(ErrorType.NOT_FOUND, message);
  }
}

export class VerificationError extends AttestationError {
  constructor(message = 'Verification failed') {
    super(ErrorType.OPERATION_FAILED, message);
  }
}

export class DuplicateVerificationError extends AttestationError {
  constructor(message = 'Verification already exists') {
    super(ErrorType.DUPLICATE, message);
  }
}

export class ReactionNotFoundError extends AttestationError {
  constructor(message = 'Reaction not found') {
    super(ErrorType.NOT_FOUND, message);
  }
}

export class DuplicateReactionError extends AttestationError {
  constructor(message = 'Reaction already exists') {
    super(ErrorType.DUPLICATE, message);
  }
}

export class CommentNotFoundError extends AttestationError {
  constructor(message = 'Comment not found') {
    super(ErrorType.NOT_FOUND, message);
  }
}

export class DuplicateCommentError extends AttestationError {
  constructor(message = 'Comment already exists') {
    super(ErrorType.DUPLICATE, message);
  }
}
