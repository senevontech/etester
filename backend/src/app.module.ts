import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { envSchema } from './config/env.schema';
import { GroupsModule } from './groups/groups.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { StorageModule } from './storage/storage.module';
import { TestsModule } from './tests/tests.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (env) => envSchema.parse(env)
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120
      }
    ]),
    PrismaModule,
    AuthModule,
    OrganizationsModule,
    GroupsModule,
    TestsModule,
    RealtimeModule,
    StorageModule
  ]
})
export class AppModule {}
