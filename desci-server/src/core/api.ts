import { Response } from 'express';

import { ApiResponse } from './types.js';

export function sendSuccess<T>(res: Response, data: T, message?: string, statusCode: number = 200) {
  const payload: ApiResponse<T> = { ok: true, data, message };
  return res.status(statusCode).json(payload);
}

export function sendError(
  res: Response,
  message: string,
  errors?: ApiResponse<unknown>['errors'],
  statusCode: number = 400,
) {
  const payload: ApiResponse<null> = { ok: false, message, errors };
  return res.status(statusCode).json(payload);
}
