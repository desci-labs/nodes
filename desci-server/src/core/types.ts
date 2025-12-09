import { Node, User } from '@prisma/client';
import { Request } from 'express';
import { z, ZodTypeAny } from 'zod';

export interface AuthenticatedRequest<P = any, ResBody = any, ReqBody = any, ReqQuery = any>
  extends Request<P, ResBody, ReqBody, ReqQuery> {
  user: User;
  authMethod: 'AUTH_TOKEN' | 'API_KEY';
}
export interface AuthenticatedRequestWithNode<P = any, ResBody = any, ReqBody = any, ReqQuery = any>
  extends Request<P, ResBody, ReqBody, ReqQuery> {
  user: User;
  node: Node;
  authMethod: 'AUTH_TOKEN' | 'API_KEY';
}

export interface OptionalAuthenticatedRequest<P = any, ResBody = any, ReqBody = any, ReqQuery = any>
  extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: User;
  authMethod?: 'AUTH_TOKEN' | 'API_KEY';
}

export type ValidatedRequest<S extends ZodTypeAny, TReq extends Request = Request> = TReq & {
  validatedData: z.infer<S>;
};

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  message?: string;
  errors?: { field: string; message: string }[];
}
