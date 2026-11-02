import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginAttemptsGuard } from './guards/login-attempts.guard';
import { MemberInvitationsController } from './member-invitations.controller';
import { MemberInvitationsRepository } from './member-invitations.repository';
import { MemberInvitationsService } from './member-invitations.service';
import { MembersController } from './members.controller';
import { MembersRepository } from './members.repository';
import { MembersService } from './members.service';
import { SessionService } from './session.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { SessionSerializer } from './strategies/session.serializer';
import { UsersRepository } from './users.repository';

@Module({
  imports: [PassportModule.register({ session: true })],
  controllers: [AuthController, MembersController, MemberInvitationsController],
  providers: [
    AuthService,
    SessionService,
    MembersService,
    MembersRepository,
    MemberInvitationsService,
    MemberInvitationsRepository,
    UsersRepository,
    LocalStrategy,
    GoogleStrategy,
    SessionSerializer,
    LoginAttemptsGuard,
  ],
  exports: [AuthService, SessionService, MembersService, MemberInvitationsService],
})
export class AuthModule {}
