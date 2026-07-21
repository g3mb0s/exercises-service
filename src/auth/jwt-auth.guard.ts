import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthenticatedRequest } from './current-user.decorator';
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) { const request = context.switchToHttp().getRequest<AuthenticatedRequest>(); const [scheme, token] = request.headers.authorization?.split(' ') ?? []; if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Bearer token is required'); request.user = await this.auth.verifyAccessToken(token); return true; }
}
