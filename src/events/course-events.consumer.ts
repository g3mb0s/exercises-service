import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Consumer, Kafka } from 'kafkajs';
import { getConfig } from '../config';
import { parseCoursePublishedEvent } from './course-published.event';
import { CourseRegistryService } from './course-registry.service';

@Injectable()
export class CourseEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CourseEventsConsumer.name);
  private readonly config = getConfig();
  private readonly consumer: Consumer;
  constructor(private readonly registry: CourseRegistryService) { this.consumer = new Kafka({ clientId: 'exercise-service', brokers: this.config.kafkaBrokers }).consumer({ groupId: this.config.kafkaGroupId }); }
  async onModuleInit() {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: this.config.courseEventsTopic, fromBeginning: true });
    await this.consumer.run({ eachMessage: async ({ message, partition }) => {
      if (!message.value) throw new Error('course event has no value');
      let event;
      try {
        event = parseCoursePublishedEvent(message.value);
      } catch (error) {
        this.logger.error(`Skipping invalid course event: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      const result = await this.registry.apply(event);
      this.logger.log(`${result} ${event.type} course=${event.course.id} partition=${partition}`);
    } });
  }
  async onModuleDestroy() { await this.consumer.disconnect(); }
}
