import { Request, Response, NextFunction } from 'express';

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  // req.session.destroy((err) => {
    // if you send data here it gives an error and kills the process lol
    res.end();
  // });
};
