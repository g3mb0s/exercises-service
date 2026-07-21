import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { getConfig, isRole } from '../config';
import { AuthUser, JwtPayload } from './auth.types';
@Injectable()
export class AuthService {
  private readonly config = getConfig();
  private publicKey = this.config.jwtPublicKey;
  async verifyAccessToken(token: string): Promise<AuthUser> {
    try { const payload = jwt.verify(token, await this.getPublicKey(), { algorithms: ['RS256'] }) as JwtPayload; if (!payload.sub || !isUuid(payload.sub) || !payload.email || !isRole(payload.role)) throw new UnauthorizedException('Invalid token payload'); return { id: payload.sub, email: payload.email, role: payload.role, emailVerified: payload.emailVerified === true }; } catch (error) { if (error instanceof UnauthorizedException) throw error; throw new UnauthorizedException('Invalid or expired token'); }
  }
  private async getPublicKey() { if (this.publicKey) return this.publicKey; const response = await fetch(this.config.authPublicKeyUrl); if (!response.ok) throw new UnauthorizedException('Unable to fetch auth public key'); const body = await response.json() as { publicKey?: unknown }; if (typeof body.publicKey !== 'string' || !body.publicKey.trim()) throw new UnauthorizedException('Invalid auth public key response'); this.publicKey = body.publicKey; return this.publicKey; }
}
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
