import { Response } from 'express';

import { AttestationError, AttestationErrorType } from '../internal.js';

import {
  AuthFailureResponse,
  BadRequestResponse,
  ForbiddenResponse,
  InternalErrorResponse,
  NotFoundResponse,
} from './ApiResponse.js';

export enum ApiErrorType {
  BAD_REQUEST = 'BadRequestError',
  UNAUTHORIZED = 'AuthFailiureError',
  INTERNAL = 'InternalError',
  NOT_FOUND = 'NotFoundError',
  NO_DATA = 'NotDataError',
  FORBIDDEN = 'ForbiddenError',
}

export abstract class ApiError extends Error {
  constructor(
    public type: ApiErrorType,
    public message: string = 'error',
  ) {
    super(type);
  }

  public static handle(err: ApiError, res: Response): Response {
    switch (err.type) {
      case ApiErrorType.UNAUTHORIZED:
        return new AuthFailureResponse(err.message).send(res);
      case ApiErrorType.BAD_REQUEST:
        return new BadRequestResponse(err.message).send(res);
      case ApiErrorType.NOT_FOUND:
      case ApiErrorType.NO_DATA:
        return new NotFoundResponse(err.message).send(res);
      case ApiErrorType.FORBIDDEN:
        return new ForbiddenResponse(err.message).send(res);
      default:
        let message = err.message;
        if (process.env.NODE_ENV === 'production') message = 'Something wrong happened.';
        return new InternalErrorResponse(message).send(res);
    }
  }

  public static transform(err: Error, res): Response {
    if (err instanceof AttestationError) {
      switch (err.type) {
        case AttestationErrorType.DUPLICATE:
        case AttestationErrorType.OPERATION_FAILED:
          return new ForbiddenResponse(err.message).send(res);
        case AttestationErrorType.UNAUTHORIZED:
          return new AuthFailureResponse(err.message).send(res);
        case AttestationErrorType.NOT_FOUND:
        case AttestationErrorType.NO_DATA:
          return new NotFoundResponse(err.message).send(res);
        default:
          return new InternalErrorResponse(err.message).send(res);
      }
    }
    return new InternalErrorResponse(err.message).send(res);
  }
}

export class AuthFailiureError extends ApiError {
  constructor(message = 'Invalid Credentials') {
    super(ApiErrorType.UNAUTHORIZED, message);
  }
}

export class BadRequestError extends ApiError {
  constructor(message = 'Bad Request') {
    super(ApiErrorType.BAD_REQUEST, message);
  }
}

export class InternalError extends ApiError {
  constructor(message = 'Invalid error') {
    super(ApiErrorType.INTERNAL, message);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Permission denied') {
    super(ApiErrorType.FORBIDDEN, message);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Not found') {
    super(ApiErrorType.NOT_FOUND, message);
  }
}

export class NoDataError extends ApiError {
  constructor(message = 'No data') {
    super(ApiErrorType.NO_DATA, message);
  }
}
