import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClipStudyService } from './clip-study.service';

@UseGuards(JwtAuthGuard)
@Controller('progress')
export class ClipStudyController {
  constructor(private readonly studies: ClipStudyService) {}

  @Get('clips')
  list(@CurrentUser() user: AuthUser) {
    return this.studies.list(user.id);
  }

  @Get('clips/:clipId')
  get(
    @CurrentUser() user: AuthUser,
    @Param('clipId', ParseUUIDPipe) clipId: string,
  ) {
    return this.studies.get(user.id, clipId);
  }

  @Post('movies/:movieId/clips/:clipId/start')
  start(
    @CurrentUser() user: AuthUser,
    @Param('movieId', ParseUUIDPipe) movieId: string,
    @Param('clipId', ParseUUIDPipe) clipId: string,
  ) {
    return this.studies.start(user.id, movieId, clipId);
  }
}
