import { Module } from '@nestjs/common';
import { PrismaModule } from './db/prisma.module';
import { CourseEventsConsumer } from './events/course-events.consumer';
import { CourseRegistryService } from './events/course-registry.service';
import { RegistryController } from './registry.controller';
import { AuthModule } from './auth/auth.module';
import { ProgressController } from './progress/progress.controller';
import { ProgressService } from './progress/progress.service';
import { ClipStudyController } from './movies/clip-study.controller';
import { ClipStudyService } from './movies/clip-study.service';
import { MovieEventsConsumer } from './movies/movie-events.consumer';
import { MovieRegistryService } from './movies/movie-registry.service';
@Module({ imports: [PrismaModule, AuthModule], controllers: [RegistryController, ProgressController, ClipStudyController], providers: [CourseRegistryService, CourseEventsConsumer, ProgressService, MovieRegistryService, MovieEventsConsumer, ClipStudyService] })
export class AppModule {}
