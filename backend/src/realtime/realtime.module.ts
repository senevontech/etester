import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MonitoringGateway } from './gateways/monitoring.gateway';
import { SignalingGateway } from './gateways/signaling.gateway';

@Module({
  imports: [AuthModule],
  providers: [MonitoringGateway, SignalingGateway],
  exports: [MonitoringGateway, SignalingGateway]
})
export class RealtimeModule {}
