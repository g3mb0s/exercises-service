import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Consumer, Kafka } from 'kafkajs';
import { getConfig } from '../config';
import { parseMovieLifecycleEvent } from './movie-events';
import { MovieRegistryService } from './movie-registry.service';

@Injectable()
export class MovieEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MovieEventsConsumer.name);
  private readonly config = getConfig();
  private readonly consumer: Consumer;

  constructor(private readonly registry: MovieRegistryService) {
    this.consumer = new Kafka({ clientId: 'exercise-service-movies', brokers: this.config.kafkaBrokers })
      .consumer({ groupId: this.config.movieKafkaGroupId });
  }

  async onModuleInit() {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: this.config.movieEventsTopic, fromBeginning: true });
    await this.consumer.run({
      eachMessage: async ({ message, partition }) => {
        if (!message.value) {
          this.logger.error('Skipping movie event without a value');
          return;
        }
        let event;
        try {
          event = parseMovieLifecycleEvent(message.value);
        } catch (error) {
          this.logger.error(`Skipping invalid movie event: ${error instanceof Error ? error.message : String(error)}`);
          return;
        }
        const result = await this.registry.apply(event);
        this.logger.log(`${result} ${event.type} movie=${event.movie.id} partition=${partition}`);
      },
    });
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }
}
