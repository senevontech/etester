import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from '@nestjs/websockets';
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';

interface SocketUser {
  sub: string;
  email: string;
  fullName: string;
}

@Injectable()
@WebSocketGateway({
  namespace: '/monitoring',
  cors: {
    origin: true,
    credentials: true
  }
})
export class MonitoringGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MonitoringGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      const payload = await this.jwtService.verifyAsync<SocketUser>(token);
      client.data.user = payload;
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('monitor:join-org')
  async joinOrganizationRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { orgId: string }
  ) {
    const user = client.data.user as SocketUser | undefined;
    if (!user) {
      throw new ForbiddenException('Socket is unauthenticated.');
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        orgId_userId: {
          orgId: payload.orgId,
          userId: user.sub
        }
      }
    });

    if (!membership || membership.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required for monitoring.');
    }

    await client.join(this.orgRoom(payload.orgId));
    this.logger.debug(`Socket ${client.id} joined monitoring room ${payload.orgId}`);
    return { joined: true };
  }

  emitAttemptUpdate(orgId: string, event: Record<string, unknown>) {
    this.server.to(this.orgRoom(orgId)).emit('attempt:update', event);
  }

  private orgRoom(orgId: string) {
    return `org:${orgId}`;
  }

  private extractToken(client: Socket) {
    const authToken = typeof client.handshake.auth.token === 'string' ? client.handshake.auth.token : '';
    const header = typeof client.handshake.headers.authorization === 'string' ? client.handshake.headers.authorization : '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    const token = authToken || bearer;
    if (!token) {
      throw new Error('Missing socket token');
    }
    return token;
  }
}
