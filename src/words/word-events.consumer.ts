import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Consumer, Kafka } from 'kafkajs';
import { getConfig } from '../config';
import { parseWordLifecycleEvent } from './word-events';
import { WordRegistryService } from './word-registry.service';

@Injectable()
export class WordEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WordEventsConsumer.name);
  private readonly config = getConfig();
  private readonly consumer: Consumer;

  constructor(private readonly registry: WordRegistryService) {
    this.consumer = new Kafka({ clientId: 'exercise-service-words', brokers: this.config.kafkaBrokers })
      .consumer({ groupId: this.config.wordKafkaGroupId });
  }

  async onModuleInit() {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: this.config.wordEventsTopic, fromBeginning: true });
    await this.consumer.run({
      eachMessage: async ({ message, partition }) => {
        if (!message.value) {
          this.logger.error('Skipping word event without a value');
          return;
        }
        let event;
        try {
          event = parseWordLifecycleEvent(message.value);
        } catch (error) {
          this.logger.error(`Skipping invalid word event: ${error instanceof Error ? error.message : String(error)}`);
          return;
        }
        const result = await this.registry.apply(event);
        this.logger.log(`${result} ${event.type} word=${event.word.id} partition=${partition}`);
      },
    });
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }
}
