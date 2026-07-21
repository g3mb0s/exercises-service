import { Module } from '@nestjs/common';
import { PrismaModule } from './db/prisma.module';
import { CourseEventsConsumer } from './events/course-events.consumer';
import { CourseRegistryService } from './events/course-registry.service';
import { RegistryController } from './registry.controller';
import { AuthModule } from './auth/auth.module';
import { ProgressController } from './progress/progress.controller';
import { ProgressService } from './progress/progress.service';
@Module({ imports: [PrismaModule, AuthModule], controllers: [RegistryController, ProgressController], providers: [CourseRegistryService, CourseEventsConsumer, ProgressService] })
export class AppModule {}
