export enum AttestationErrorType {
  UNAUTHORIZED = 'NoAccessError',
  NOT_FOUND = 'NotFoundError',
  NO_DATA = 'NotDataError',
  DUPLICATE = 'DuplicateDataError',
  OPERATION_FAILED = 'ForbiddenError',
}

export class AttestationError extends Error {
  name = 'AttestationError';
  constructor(
    public type: AttestationErrorType,
    public message: string = 'error',
  ) {
    super(type);
  }
}

export class AttestationNotFoundError extends AttestationError {
  constructor(message = 'Attestation Not Found') {
    super(AttestationErrorType.NOT_FOUND, message);
  }
}

export class AttestationVersionNotFoundError extends AttestationError {
  constructor(message = 'Attestation Version Not Found') {
    super(AttestationErrorType.NOT_FOUND, message);
  }
}

export class CommunityNotFoundError extends AttestationError {
  constructor(message = 'Community Not Found') {
    super(AttestationErrorType.NOT_FOUND, message);
  }
}

export class NoAccessError extends AttestationError {
  constructor(message = 'UnAuthorized access') {
    super(AttestationErrorType.UNAUTHORIZED, message);
  }
}

export class DuplicateDataError extends AttestationError {
  constructor(message = 'Entity already exists') {
    super(AttestationErrorType.DUPLICATE, message);
  }
}

export class DuplicateClaimError extends AttestationError {
  constructor(message = 'Claim already exists') {
    super(AttestationErrorType.DUPLICATE, message);
  }
}

export class ClaimError extends AttestationError {
  constructor(message = 'Claim error') {
    super(AttestationErrorType.OPERATION_FAILED, message);
  }
}

export class ClaimNotFoundError extends AttestationError {
  constructor(message = 'Claim not found') {
    super(AttestationErrorType.NOT_FOUND, message);
  }
}

export class VerificationNotFoundError extends AttestationError {
  constructor(message = 'Verification not found') {
    super(AttestationErrorType.NOT_FOUND, message);
  }
}

export class VerificationError extends AttestationError {
  constructor(message = 'Verification failed') {
    super(AttestationErrorType.OPERATION_FAILED, message);
  }
}

export class DuplicateVerificationError extends AttestationError {
  constructor(message = 'Verification already exists') {
    super(AttestationErrorType.DUPLICATE, message);
  }
}

export class ReactionNotFoundError extends AttestationError {
  constructor(message = 'Reaction not found') {
    super(AttestationErrorType.NOT_FOUND, message);
  }
}

export class DuplicateReactionError extends AttestationError {
  constructor(message = 'Reaction already exists') {
    super(AttestationErrorType.DUPLICATE, message);
  }
}

export class CommentNotFoundError extends AttestationError {
  constructor(message = 'Comment not found') {
    super(AttestationErrorType.NOT_FOUND, message);
  }
}

export class DuplicateCommentError extends AttestationError {
  constructor(message = 'Comment already exists') {
    super(AttestationErrorType.DUPLICATE, message);
  }
}
