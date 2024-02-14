import { v4 } from 'uuid';

export type Either<T, E> = { ok: true; value: T } | { ok: false; value: E };

export type ProcessingError =
  | UnhandledError
  | MixingExternalDataError
  | NotEnoughSpaceError
  | InvalidManifestError
  | IpfsUnresolvableError
  | DuplicateFileError
  | IpfsUploadFailureError
  | DagExtensionFailureError
  | ManifestPersistFailError
  | ExternalUrlResolutionError;

interface BaseProcessingError {
  type: string;
  status: number;
  message: string;
}

interface UnhandledError extends BaseProcessingError {
  type: 'UnhandledError';
  message: string;
  error: Error;
  status: 500;
}

export const createUnhandledError = (error: Error): UnhandledError => ({
  type: 'UnhandledError',
  message: `Unhandled error occured, error reference: ${v4()}`,
  error: error,
  status: 500,
});

interface MixingExternalDataError extends BaseProcessingError {
  type: 'MixingExternalDataError';
  message: string;
  status: 400;
}

export const createMixingExternalDataError = (): MixingExternalDataError => ({
  type: 'MixingExternalDataError',
  message: 'Unable to add files to external CID directory',
  status: 400,
});

interface NotEnoughSpaceError extends BaseProcessingError {
  type: 'NotEnoughSpaceError';
  message: string;
  status: 507;
}

export const createNotEnoughSpaceError = (message: string): NotEnoughSpaceError => ({
  type: 'NotEnoughSpaceError',
  message,
  status: 507,
});

interface InvalidManifestError extends BaseProcessingError {
  type: 'InvalidManifestError';
  message: string;
  status: 400;
}

export const createInvalidManifestError = (message: string): InvalidManifestError => ({
  type: 'InvalidManifestError',
  message,
  status: 400,
});

interface IpfsUnresolvableError extends BaseProcessingError {
  type: 'IpfsUnresolvableError';
  message: string;
  status: 404;
}

export const createIpfsUnresolvableError = (message: string): IpfsUnresolvableError => ({
  type: 'IpfsUnresolvableError',
  message,
  status: 404,
});

interface DuplicateFileError extends BaseProcessingError {
  type: 'DuplicateFileError';
  message: string;
  status: 409;
}

export const createDuplicateFileError = (): DuplicateFileError => ({
  type: 'DuplicateFileError',
  message: 'Duplicate files rejected',
  status: 409,
});

interface IpfsUploadFailureError extends BaseProcessingError {
  type: 'IpfsUploadFailureError';
  message: string;
  status: 502;
}

export const createIpfsUploadFailureError = (): IpfsUploadFailureError => ({
  type: 'IpfsUploadFailureError',
  message: 'Failed to upload files onto IPFS',
  status: 502,
});

interface DagExtensionFailureError extends BaseProcessingError {
  type: 'DagExtensionFailureError';
  message: string;
  status: 500;
}

export const createDagExtensionFailureError = (): DagExtensionFailureError => ({
  type: 'DagExtensionFailureError',
  message: 'DAG extension failed',
  status: 500,
});

interface ManifestPersistFailError extends BaseProcessingError {
  type: 'ManifestPersistFailError';
  message: string;
  status: 500;
}

export const createManifestPersistFailError = (message: string): ManifestPersistFailError => ({
  type: 'ManifestPersistFailError',
  message,
  status: 500,
});

interface ExternalUrlResolutionError extends BaseProcessingError {
  type: 'ExternalUrlResolutionError';
  message: string;
  status: 500;
}

export const createExternalUrlResolutionError = (message: string): ExternalUrlResolutionError => ({
  type: 'ExternalUrlResolutionError',
  message,
  status: 500,
});

interface NewFolderCreationError extends BaseProcessingError {
  type: 'NewFolderCreationError';
  message: string;
  status: 500;
}

export const createNewFolderCreationError = (message: string): NewFolderCreationError => ({
  type: 'NewFolderCreationError',
  message,
  status: 500,
});
