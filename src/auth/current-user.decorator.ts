import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from './auth.types';
export interface AuthenticatedRequest extends Request { user?: AuthUser; }
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => context.switchToHttp().getRequest<AuthenticatedRequest>().user as AuthUser);
