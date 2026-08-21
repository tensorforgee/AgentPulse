import type { Request } from 'express';

export interface OperationalRequest extends Request {
  requestId?: string;
}
