import { User } from '@prisma/client';
import { Request } from 'express';

export interface AuthenticatedRequest<P = any, ResBody = any, ReqBody = any, ReqQuery = any>
  extends Request<P, ResBody, ReqBody, ReqQuery> {
  user: User;
  authMethod: 'AUTH_TOKEN' | 'API_KEY';
}

export interface OptionalAuthenticatedRequest<P = any, ResBody = any, ReqBody = any, ReqQuery = any>
  extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: User;
  authMethod?: 'AUTH_TOKEN' | 'API_KEY';
}

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  message?: string;
  errors?: { field: string; message: string }[];
}
