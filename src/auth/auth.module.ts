import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
@Module({ providers: [AuthService, JwtAuthGuard], exports: [AuthService, JwtAuthGuard] })
export class AuthModule {}
