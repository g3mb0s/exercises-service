import { Role } from '../config';
export interface AuthUser { id: string; email: string; role: Role; emailVerified: boolean; }
export interface JwtPayload { sub?: string; email?: string; role?: unknown; emailVerified?: boolean; }
