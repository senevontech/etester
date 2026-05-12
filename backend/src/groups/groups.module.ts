import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  imports: [OrganizationsModule],
  controllers: [GroupsController],
  providers: [GroupsService]
})
export class GroupsModule {}
