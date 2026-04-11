import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { JoinOrganizationDto } from './dto/join-organization.dto';
import { SwitchOrganizationDto } from './dto/switch-organization.dto';
import { OrganizationsService } from './organizations.service';

@UseGuards(JwtAuthGuard)
@Controller('orgs')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('mine')
  getMine(@CurrentUser() user: { sub: string }) {
    return this.organizationsService.getMine(user.sub);
  }

  @Post()
  create(@CurrentUser() user: { sub: string }, @Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(user.sub, dto);
  }

  @Post('join')
  join(@CurrentUser() user: { sub: string }, @Body() dto: JoinOrganizationDto) {
    return this.organizationsService.join(user.sub, dto);
  }

  @Post('switch')
  switch(@CurrentUser() user: { sub: string }, @Body() dto: SwitchOrganizationDto) {
    return this.organizationsService.switch(user.sub, dto);
  }

  @Get(':orgId/members')
  getMembers(@CurrentUser() user: { sub: string }, @Param('orgId') orgId: string) {
    return this.organizationsService.getMembers(user.sub, orgId);
  }

  @Post(':orgId/invite-code/regenerate')
  regenerateInviteCode(@CurrentUser() user: { sub: string }, @Param('orgId') orgId: string) {
    return this.organizationsService.regenerateInviteCode(user.sub, orgId);
  }
}
