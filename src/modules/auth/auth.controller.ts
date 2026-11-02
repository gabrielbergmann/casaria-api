import { Body, Controller, Get, HttpCode, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ZodResponse } from 'nestjs-zod';
import { Authenticated, Public, TermsExempt } from '../../common/auth/access.decorators';
import type { SessionUser } from '../../common/auth/session-user';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { MeDto } from './dto/me.dto';
import { PasswordResetDto } from './dto/password-reset.dto';
import { TermsAcceptanceDto } from './dto/terms-acceptance.dto';
import { GoogleAuthGuard, type GoogleCallbackRequest } from './guards/google-auth.guard';
import { LocalLoginGuard } from './guards/local-login.guard';
import { LoginAttemptsGuard } from './guards/login-attempts.guard';
import { SessionService } from './session.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(204)
  @UseGuards(LoginAttemptsGuard, LocalLoginGuard)
  async login(@Req() req: Request, @Body() _body: LoginDto): Promise<void> {
    await this.sessions.start(req, req.user as SessionUser);
  }

  @Get('google')
  @Public()
  @UseGuards(GoogleAuthGuard)
  google(): void {
    // O guard redireciona para o Google.
  }

  @Get('google/callback')
  @Public()
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: Request & GoogleCallbackRequest, @Res() res: Response) {
    const user = req.user as SessionUser | null;
    if (!user) return res.redirect(this.auth.panelUrl(`/login?error=${req.googleError}`));
    await this.sessions.start(req, user);
    return res.redirect(this.auth.panelUrl('/'));
  }

  @Get('me')
  @Authenticated()
  @TermsExempt()
  @ZodResponse({ status: 200, type: MeDto })
  me(@Req() req: Request) {
    return this.auth.me(req.user as SessionUser);
  }

  @Post('logout')
  @Authenticated()
  @TermsExempt()
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.sessions.end(req, res);
  }

  /** Aceite dos termos e da política vigentes (spec 015 RF11). */
  @Post('terms-acceptance')
  @Authenticated()
  @TermsExempt()
  @HttpCode(204)
  async acceptTerms(@Req() req: Request, @Body() body: TermsAcceptanceDto): Promise<void> {
    await this.auth.acceptTerms((req.user as SessionUser).id, body.version);
  }

  @Put('password')
  @Authenticated()
  @HttpCode(204)
  async changePassword(@Req() req: Request, @Body() body: ChangePasswordDto): Promise<void> {
    const user = req.user as SessionUser;
    const version = await this.auth.changePassword(user.id, body.currentPassword, body.newPassword);
    this.sessions.keepAfterPasswordChange(req, version);
  }

  @Post('password-reset')
  @Public()
  @HttpCode(204)
  async resetPassword(@Body() body: PasswordResetDto): Promise<void> {
    await this.auth.resetPassword(body.token, body.newPassword);
  }
}
