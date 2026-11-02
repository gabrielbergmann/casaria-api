import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { type Profile, Strategy } from 'passport-google-oauth20';
import type { SessionUser } from '../../../common/auth/session-user';
import type { Env } from '../../../infra/config/env.schema';
import { apiOrigin } from '../../../infra/config/public-urls';
import { AuthService } from '../auth.service';

// state: true guarda o state do OAuth na sessão e o confere na volta.
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    config: ConfigService<Env, true>,
    private readonly auth: AuthService,
  ) {
    const env = {
      NODE_ENV: config.get('NODE_ENV', { infer: true }),
      APP_DOMAIN: config.get('APP_DOMAIN', { infer: true }),
      DEV_PANEL_URL: config.get('DEV_PANEL_URL', { infer: true }),
    };
    super({
      clientID: config.get('GOOGLE_CLIENT_ID', { infer: true }),
      clientSecret: config.get('GOOGLE_CLIENT_SECRET', { infer: true }),
      callbackURL: `${apiOrigin(env)}/v1/auth/google/callback`,
      scope: ['email', 'profile'],
      state: true,
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile): Promise<SessionUser> {
    return this.auth.validateGoogleProfile(profile);
  }
}
