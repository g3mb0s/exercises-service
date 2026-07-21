import { Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { CourseRegistryService } from './events/course-registry.service';
@Controller()
export class RegistryController {
  constructor(private readonly registry: CourseRegistryService) {}
  @Get('health/live') live() { return { status: 'ok' }; }
  @Get('content-registry/courses/:id') async getCourse(@Param('id', ParseUUIDPipe) id: string) { const course = await this.registry.getOrSynchronizeCourse(id); if (!course) throw new NotFoundException('Published course not found'); return { course }; }
}
