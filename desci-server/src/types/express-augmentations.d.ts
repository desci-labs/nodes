import { JwtPayload } from '../JwtPayload';

// Re-export all Express types from the original module
export * from 'express';

// Just augment the Express namespace without changing module structure
declare global {
  namespace Express {
    export interface Request {
      jwtPayload: JwtPayload;
      // language: Language;
    }
    export interface Response {
      customSuccess(httpStatusCode: number, message: string, data?: any): Response;
    }
  }
}
