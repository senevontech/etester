import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { TestsController } from './tests.controller';
import { TestsService } from './tests.service';

@Module({
  imports: [OrganizationsModule],
  controllers: [TestsController],
  providers: [TestsService],
  exports: [TestsService]
})
export class TestsModule {}
