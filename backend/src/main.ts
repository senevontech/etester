import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: false
  });

  const configService = app.get(ConfigService);
  const prismaService = app.get(PrismaService);
  const frontendOrigin = configService.getOrThrow<string>('FRONTEND_ORIGIN');

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: [frontendOrigin],
    credentials: true
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false
    })
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Etester API')
    .setDescription('Production backend for Etester')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await prismaService.enableShutdownHooks(app);

  const port = configService.get<number>('PORT', 4000);
  await app.listen(port);
}

void bootstrap();
