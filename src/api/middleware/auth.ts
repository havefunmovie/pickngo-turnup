import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '@domain/users/user.service';
import { AuthContext, UserRole } from '@domain/types';
import { UnauthorizedError, ForbiddenError } from '@domain/errors';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError());
  }
  try {
    req.auth = verifyAccessToken(header.slice(7));
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(new UnauthorizedError());
    if (!roles.includes(req.auth.role)) return next(new ForbiddenError());
    next();
  };
}
