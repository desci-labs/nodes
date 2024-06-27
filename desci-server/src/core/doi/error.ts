export enum DoiErrorType {
  DUPLICATE_MINT = 'DuplicateDoiError',
  NO_MANUSCRIPT = 'NoManuscriptError',
  BAD_METADATA = 'InvalidManifestError',
  INCOMPLETE_ATTESTATIONS = 'MissingAttestationsError',
  REGISTRATION_ERROR = 'RegistrationError',
  FORBIDDEN = 'ForbiddenError',
}

export class DoiError extends Error {
  name = 'DoiValidationError';

  constructor(
    public type: DoiErrorType,
    public message: string = 'Doi Error',
  ) {
    super(type);
  }
}

export class BadManifestError extends DoiError {
  constructor(message = 'Title, Abstract or Contributors is missing') {
    super(DoiErrorType.BAD_METADATA, message);
  }
}

export class NoManuscriptError extends DoiError {
  constructor(message = 'Node has no manuscript') {
    super(DoiErrorType.NO_MANUSCRIPT, message);
  }
}

export class AttestationsError extends DoiError {
  constructor(message = 'All required attestations are not claimed or verified') {
    super(DoiErrorType.INCOMPLETE_ATTESTATIONS, message);
  }
}

export class DuplicateMintError extends DoiError {
  constructor(message = 'DOI already minted for node') {
    super(DoiErrorType.DUPLICATE_MINT, message);
  }
}

export class MintError extends DoiError {
  constructor(message = 'An Error occurred while registring a new DOI') {
    super(DoiErrorType.DUPLICATE_MINT, message);
  }
}

export class ForbiddenMintError extends DoiError {
  constructor(message = 'Research object not valid') {
    super(DoiErrorType.FORBIDDEN, message);
  }
}
