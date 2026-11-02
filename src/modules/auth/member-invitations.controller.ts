import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ZodResponse } from 'nestjs-zod';
import { Authenticated, PanelOriginOnly, Public } from '../../common/auth/access.decorators';
import type { SessionUser } from '../../common/auth/session-user';
import {
  AcceptedInvitationDto,
  AcceptWithSignupDto,
  InvitationLookupDto,
  InvitationTokenDto,
} from './dto/member-access.dto';
import { LoginAttemptsGuard } from './guards/login-attempts.guard';
import { MemberInvitationsService } from './member-invitations.service';
import { SessionService } from './session.service';

// O token chega só no corpo de POST (o link o leva no fragmento), nunca na URL (RNF01 da 005).
@ApiTags('member-invitations')
@Controller('member-invitations')
export class MemberInvitationsController {
  constructor(
    private readonly invitations: MemberInvitationsService,
    private readonly sessions: SessionService,
  ) {}

  @Post('lookup')
  @Public()
  @PanelOriginOnly()
  @HttpCode(200)
  @ZodResponse({ status: 200, type: InvitationLookupDto })
  lookup(@Body() body: InvitationTokenDto) {
    return this.invitations.lookup(body.token);
  }

  @Post('accept')
  @Authenticated()
  @HttpCode(200)
  @ZodResponse({ status: 200, type: AcceptedInvitationDto })
  async accept(@Req() req: Request, @Body() body: InvitationTokenDto) {
    const weddingId = await this.invitations.accept(body.token, req.user as SessionUser);
    return { weddingId };
  }

  @Post('accept-with-signup')
  @Public()
  @PanelOriginOnly()
  @UseGuards(LoginAttemptsGuard)
  @ZodResponse({ status: 201, type: AcceptedInvitationDto })
  async acceptWithSignup(@Req() req: Request, @Body() body: AcceptWithSignupDto) {
    const { user, weddingId } = await this.invitations.acceptWithSignup(
      body.token,
      body.name,
      body.password,
    );
    await this.sessions.start(req, user);
    return { weddingId };
  }
}
