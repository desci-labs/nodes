import { JwtPayload } from '../JwtPayload';

// import "express-session";
// import { User } from '.prisma/client';
// import { SiweMessage } from 'siwe';

// declare module 'express-session' {
//   interface SessionData {
//     userId?: number;
//     user?: User;
//     nonce?: string;
//     siwe?: SiweMessage;
//   }
// }

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
