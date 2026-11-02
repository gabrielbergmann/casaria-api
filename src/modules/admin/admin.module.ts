import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WeddingsModule } from '../weddings/weddings.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [WeddingsModule, AuthModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
