import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  authUserId?: string;
}

export interface JwtAuthPayload {
  sub: string;
  type: 'access' | 'refresh';
  jti: string;
}
