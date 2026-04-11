import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { CreateGroupDto } from './dto/create-group.dto';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationsService: OrganizationsService
  ) {}

  async list(userId: string, orgId: string) {
    await this.organizationsService.assertMembership(userId, orgId);
    const groups = await this.prisma.group.findMany({
      where: { orgId },
      orderBy: { name: 'asc' }
    });

    return {
      groups: groups.map((group) => ({
        id: group.id,
        org_id: group.orgId,
        name: group.name,
        description: group.description,
        created_at: group.createdAt.toISOString()
      }))
    };
  }

  async create(userId: string, orgId: string, dto: CreateGroupDto) {
    await this.organizationsService.assertAdmin(userId, orgId);
    const group = await this.prisma.group.create({
      data: {
        orgId,
        name: dto.name.trim(),
        description: dto.description?.trim() || ''
      }
    });

    return {
      group: {
        id: group.id,
        org_id: group.orgId,
        name: group.name,
        description: group.description,
        created_at: group.createdAt.toISOString()
      }
    };
  }

  async remove(userId: string, groupId: string) {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Group not found.');
    }

    await this.organizationsService.assertAdmin(userId, group.orgId);
    await this.prisma.group.delete({ where: { id: groupId } });
    return { success: true };
  }

  async listMembers(userId: string, groupId: string) {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Group not found.');
    }

    await this.organizationsService.assertMembership(userId, group.orgId);

    const members = await this.prisma.groupMember.findMany({
      where: { groupId },
      include: { user: true },
      orderBy: { joinedAt: 'asc' }
    });

    return {
      members: members.map((member) => ({
        userId: member.userId,
        name: member.user.fullName,
        email: member.user.email
      }))
    };
  }

  async addMember(userId: string, groupId: string, dto: AddGroupMemberDto) {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Group not found.');
    }

    await this.organizationsService.assertAdmin(userId, group.orgId);
    await this.prisma.groupMember.upsert({
      where: {
        groupId_userId: {
          groupId,
          userId: dto.userId
        }
      },
      update: {},
      create: {
        groupId,
        userId: dto.userId
      }
    });

    return { success: true };
  }

  async removeMember(userId: string, groupId: string, targetUserId: string) {
    const group = await this.prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Group not found.');
    }

    await this.organizationsService.assertAdmin(userId, group.orgId);
    await this.prisma.groupMember.deleteMany({
      where: {
        groupId,
        userId: targetUserId
      }
    });

    return { success: true };
  }
}
