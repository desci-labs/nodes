import { JwtPayload } from '../JwtPayload';

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
