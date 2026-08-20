import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SrsService } from './srs.service';

@UseGuards(JwtAuthGuard)
@Controller('srs')
export class SrsController {
  constructor(private readonly srs: SrsService) {}

  @Get('words/new')
  getNew(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.srs.getNew(user.id, limit);
  }

  @Get('words/stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.srs.getStats(user.id);
  }

  @Get('words/review')
  getDue(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.srs.getDue(user.id, 'word', limit);
  }

  @Post('words/start')
  start(@CurrentUser() user: AuthUser, @Body() body: { word_id?: string }) {
    if (!body?.word_id || !isUuid(body.word_id)) {
      throw new BadRequestException('word_id must be a UUID');
    }
    return this.srs.start(user.id, 'word', body.word_id);
  }

  @Post('words/:wordId/review')
  review(
    @CurrentUser() user: AuthUser,
    @Param('wordId', ParseUUIDPipe) wordId: string,
    @Body() body: { remembered?: boolean },
  ) {
    if (typeof body?.remembered !== 'boolean') {
      throw new BadRequestException('remembered must be a boolean');
    }
    return this.srs.answer(user.id, 'word', wordId, body.remembered);
  }

  @Post('words/:wordId/known')
  known(@CurrentUser() user: AuthUser, @Param('wordId', ParseUUIDPipe) wordId: string) {
    return this.srs.markKnown(user.id, 'word', wordId);
  }

  @Get('categories')
  categories() {
    return this.srs.listCategories();
  }

  @Get('preferences')
  getPreferences(@CurrentUser() user: AuthUser) {
    return this.srs.getPreferences(user.id);
  }

  @Put('preferences')
  putPreferences(@CurrentUser() user: AuthUser, @Body() body: { category_slugs?: string[] }) {
    return this.srs.savePreferences(user.id, body?.category_slugs ?? []);
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
