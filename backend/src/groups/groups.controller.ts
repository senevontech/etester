import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { GroupsService } from './groups.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get('orgs/:orgId/groups')
  list(@CurrentUser() user: { sub: string }, @Param('orgId') orgId: string) {
    return this.groupsService.list(user.sub, orgId);
  }

  @Post('orgs/:orgId/groups')
  create(@CurrentUser() user: { sub: string }, @Param('orgId') orgId: string, @Body() dto: CreateGroupDto) {
    return this.groupsService.create(user.sub, orgId, dto);
  }

  @Delete('groups/:groupId')
  remove(@CurrentUser() user: { sub: string }, @Param('groupId') groupId: string) {
    return this.groupsService.remove(user.sub, groupId);
  }

  @Get('groups/:groupId/members')
  listMembers(@CurrentUser() user: { sub: string }, @Param('groupId') groupId: string) {
    return this.groupsService.listMembers(user.sub, groupId);
  }

  @Post('groups/:groupId/members')
  addMember(@CurrentUser() user: { sub: string }, @Param('groupId') groupId: string, @Body() dto: AddGroupMemberDto) {
    return this.groupsService.addMember(user.sub, groupId, dto);
  }

  @Delete('groups/:groupId/members/:userId')
  removeMember(@CurrentUser() user: { sub: string }, @Param('groupId') groupId: string, @Param('userId') targetUserId: string) {
    return this.groupsService.removeMember(user.sub, groupId, targetUserId);
  }
}
