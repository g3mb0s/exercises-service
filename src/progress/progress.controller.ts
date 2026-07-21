import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ExerciseAttempt, ProgressService } from './progress.service';

@UseGuards(JwtAuthGuard)
@Controller('progress')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}
  @Get('courses/:courseId') getCourse(@CurrentUser() user: AuthUser, @Param('courseId', ParseUUIDPipe) courseId: string) { return this.progress.getCourseProgress(user.id, courseId); }
  @Get('courses/:courseId/entries/:entryId') getLearningEntry(@CurrentUser() user: AuthUser, @Param('courseId', ParseUUIDPipe) courseId: string, @Param('entryId', ParseUUIDPipe) entryId: string) { return this.progress.getLearningEntry(user.id, courseId, entryId); }
  @Post('course-entries/:entryId/complete') completeArticle(@CurrentUser() user: AuthUser, @Param('entryId', ParseUUIDPipe) entryId: string) { return this.progress.completeArticle(user.id, entryId); }
  @Post('course-entries/:entryId/attempt') attempt(@CurrentUser() user: AuthUser, @Param('entryId', ParseUUIDPipe) entryId: string, @Body() body: ExerciseAttempt) { if (!body || (!Array.isArray(body.items) && !Array.isArray(body.answers))) throw new BadRequestException('items must be an array'); return this.progress.attemptExercise(user.id, entryId, body); }
}
