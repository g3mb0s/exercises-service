import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getConfig } from './config';
async function bootstrap() { const app = await NestFactory.create(AppModule); app.enableShutdownHooks(); await app.listen(getConfig().port); }
void bootstrap();
