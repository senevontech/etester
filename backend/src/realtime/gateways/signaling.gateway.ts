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

interface SignalingPayload {
  sessionId: string;
  targetSocketId?: string;
  data: Record<string, unknown>;
}

@Injectable()
@WebSocketGateway({
  namespace: '/signaling',
  cors: {
    origin: true,
    credentials: true
  }
})
export class SignalingGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(SignalingGateway.name);

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

  @SubscribeMessage('signal:join')
  async joinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: string }
  ) {
    const user = client.data.user as SocketUser | undefined;
    if (!user) {
      throw new ForbiddenException('Socket is unauthenticated.');
    }

    const attempt = await this.prisma.testAttempt.findUnique({
      where: { id: payload.sessionId },
      select: { id: true, studentId: true, orgId: true }
    });

    if (!attempt) {
      throw new ForbiddenException('Session not found.');
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        orgId_userId: {
          orgId: attempt.orgId,
          userId: user.sub
        }
      }
    });

    const isStudentOwner = attempt.studentId === user.sub;
    const isOrgAdmin = membership?.role === 'ADMIN';
    if (!isStudentOwner && !isOrgAdmin) {
      throw new ForbiddenException('Not allowed to join this signaling session.');
    }

    await client.join(this.sessionRoom(payload.sessionId));
    this.logger.debug(`Socket ${client.id} joined signaling session ${payload.sessionId}`);
    return { joined: true, socketId: client.id };
  }

  @SubscribeMessage('signal:offer')
  relayOffer(@ConnectedSocket() client: Socket, @MessageBody() payload: SignalingPayload) {
    this.forward(client, 'signal:offer', payload);
  }

  @SubscribeMessage('signal:answer')
  relayAnswer(@ConnectedSocket() client: Socket, @MessageBody() payload: SignalingPayload) {
    this.forward(client, 'signal:answer', payload);
  }

  @SubscribeMessage('signal:ice-candidate')
  relayIceCandidate(@ConnectedSocket() client: Socket, @MessageBody() payload: SignalingPayload) {
    this.forward(client, 'signal:ice-candidate', payload);
  }

  private forward(client: Socket, event: string, payload: SignalingPayload) {
    const message = {
      fromSocketId: client.id,
      sessionId: payload.sessionId,
      data: payload.data
    };

    if (payload.targetSocketId) {
      client.to(payload.targetSocketId).emit(event, message);
      return;
    }

    client.to(this.sessionRoom(payload.sessionId)).emit(event, message);
  }

  private sessionRoom(sessionId: string) {
    return `session:${sessionId}`;
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
