import { Response } from 'express';

enum ResponseStatus {
  SUCCESS = 200,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  INTERNAL_ERROR = 500,
}

type Headers = { [key: string]: string };

export interface ToApiResponse {
  apiResponse(res: Response): ApiResponse;
}

export abstract class ApiResponse {
  constructor(
    private status: ResponseStatus,
    message: string,
  ) {}

  protected prepare<T extends ApiResponse>(res: Response, response: T, headers: { [key: string]: string }): Response {
    // console.log('prepare', response);
    for (const [key, value] of Object.entries(headers)) res.append(key, value);
    return res.status(this.status).json(ApiResponse.sanitize(response));
  }

  public send(res: Response, headers: Headers = {}): Response {
    return this.prepare(res, this, headers);
  }

  private static sanitize<T extends ApiResponse>(response: T): T {
    const clone: T = {} as T;
    Object.assign(clone, response);
    delete clone.status;
    for (const field in clone) if (clone[field] === 'undefined') delete clone[field];
    return clone;
  }
}

export class SuccessMessageResponse<T> extends ApiResponse {
  constructor(message = 'Success') {
    super(ResponseStatus.SUCCESS, message);
  }
}

export class SuccessResponse<T> extends ApiResponse {
  constructor(
    private data: T,
    message = 'Success',
  ) {
    super(ResponseStatus.SUCCESS, message);
  }

  send(res: Response, headers?: Headers): Response {
    return super.prepare<SuccessResponse<T>>(res, this, headers ?? {});
  }
}

export class NotFoundResponse extends ApiResponse {
  constructor(message = 'NOT FOUND') {
    super(ResponseStatus.NOT_FOUND, message);
  }
}

export class ForbiddenResponse extends ApiResponse {
  constructor(message = 'Forbidden') {
    super(ResponseStatus.FORBIDDEN, message);
  }
}

export class BadRequestResponse extends ApiResponse {
  constructor(message = 'Bad Request') {
    super(ResponseStatus.BAD_REQUEST, message);
  }
}

export class InternalErrorResponse extends ApiResponse {
  constructor(message = 'Internal Error') {
    super(ResponseStatus.INTERNAL_ERROR, message);
  }
}

export class AuthFailureResponse extends ApiResponse {
  constructor(message = 'Unauthorized') {
    super(ResponseStatus.UNAUTHORIZED, message);
  }
}
