import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: { id: true }
    });

    if (existing) {
      throw new ConflictException('An account with that email already exists.');
    }

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName.trim(),
        email: dto.email.toLowerCase(),
        passwordHash: await hash(dto.password, 12)
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        createdAt: true
      }
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() }
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const isValid = await compare(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    return this.buildAuthResponse({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      createdAt: user.createdAt
    });
  }

  async getSession(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        createdAt: true
      }
    });

    if (!user) {
      throw new UnauthorizedException('Session is invalid.');
    }

    return {
      session: {
        userId: user.id,
        createdAt: user.createdAt.toISOString()
      },
      user: {
        id: user.id,
        name: user.fullName,
        email: user.email,
        role: null
      }
    };
  }

  private async buildAuthResponse(user: {
    id: string;
    fullName: string;
    email: string;
    createdAt: Date;
  }) {
    const payload = {
      sub: user.id,
      email: user.email,
      fullName: user.fullName
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: (process.env.JWT_REFRESH_TTL || '7d') as never
      })
    ]);

    return {
      session: {
        userId: user.id,
        createdAt: user.createdAt.toISOString()
      },
      user: {
        id: user.id,
        name: user.fullName,
        email: user.email,
        role: null
      },
      tokens: {
        accessToken,
        refreshToken
      }
    };
  }
}
