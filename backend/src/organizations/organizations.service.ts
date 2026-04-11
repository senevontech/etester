import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { JoinOrganizationDto } from './dto/join-organization.dto';
import { SwitchOrganizationDto } from './dto/switch-organization.dto';
import { toApiRole, toDbRole } from '../common/mappers/api.mapper';

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48) || 'org';

const inviteCode = () => Math.random().toString(16).slice(2, 10).padEnd(8, '0').slice(0, 8);

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMine(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { joinedAt: 'asc' }
    });

    return {
      orgs: memberships.map((membership) => ({
        org: {
          id: membership.organization.id,
          name: membership.organization.name,
          slug: membership.organization.slug,
          invite_code: membership.role === 'ADMIN' ? membership.organization.inviteCode : undefined,
          created_by: membership.organization.createdById,
          created_at: membership.organization.createdAt.toISOString()
        },
        role: toApiRole(membership.role)
      }))
    };
  }

  async create(userId: string, dto: CreateOrganizationDto) {
    const baseSlug = slugify(dto.name);
    let slug = baseSlug;
    let suffix = 1;

    while (await this.prisma.organization.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    const organization = await this.prisma.organization.create({
      data: {
        name: dto.name.trim(),
        slug,
        inviteCode: inviteCode(),
        createdById: userId,
        members: {
          create: {
            userId,
            role: toDbRole('admin')
          }
        }
      }
    });

    return {
      org: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        invite_code: organization.inviteCode,
        created_by: organization.createdById,
        created_at: organization.createdAt.toISOString()
      }
    };
  }

  async join(userId: string, dto: JoinOrganizationDto) {
    const organization = await this.prisma.organization.findFirst({
      where: {
        inviteCode: dto.code.toLowerCase()
      }
    });

    if (!organization) {
      throw new NotFoundException('Invalid invite code. Please check and try again.');
    }

    const existing = await this.prisma.organizationMember.findUnique({
      where: {
        orgId_userId: {
          orgId: organization.id,
          userId
        }
      }
    });

    if (existing) {
      return { success: true };
    }

    await this.prisma.organizationMember.create({
      data: {
        orgId: organization.id,
        userId,
        role: toDbRole('student')
      }
    });

    return { success: true };
  }

  async switch(userId: string, dto: SwitchOrganizationDto) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        orgId_userId: {
          orgId: dto.orgId,
          userId
        }
      }
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization.');
    }

    return { role: toApiRole(membership.role) };
  }

  async regenerateInviteCode(userId: string, orgId: string) {
    await this.assertAdmin(userId, orgId);

    const organization = await this.prisma.organization.update({
      where: { id: orgId },
      data: { inviteCode: inviteCode() }
    });

    return {
      org: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        invite_code: organization.inviteCode,
        created_by: organization.createdById,
        created_at: organization.createdAt.toISOString()
      }
    };
  }

  async getMembers(userId: string, orgId: string) {
    await this.assertAdmin(userId, orgId);

    const members = await this.prisma.organizationMember.findMany({
      where: { orgId },
      include: { user: true },
      orderBy: { joinedAt: 'asc' }
    });

    return {
      members: members.map((member) => ({
        id: member.id,
        org_id: member.orgId,
        user_id: member.userId,
        role: toApiRole(member.role),
        joined_at: member.joinedAt.toISOString(),
        profile: {
          name: member.user.fullName,
          email: member.user.email
        }
      }))
    };
  }

  async assertMembership(userId: string, orgId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        orgId_userId: {
          orgId,
          userId
        }
      }
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization.');
    }

    return membership;
  }

  async assertAdmin(userId: string, orgId: string) {
    const membership = await this.assertMembership(userId, orgId);
    if (membership.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required.');
    }
    return membership;
  }
}
