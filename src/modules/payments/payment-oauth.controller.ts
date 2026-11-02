import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Authenticated } from '../../common/auth/access.decorators';
import type { SessionUser } from '../../common/auth/session-user';
import { AuthService } from '../auth/auth.service';
import { PaymentAccountsService } from './accounts/payment-accounts.service';
import { weddingIdOfState } from './accounts/pkce';
import { PaymentOAuthFailed } from './errors/payment-errors';

const OAUTH_FAILED = 'payment.oauth_failed';

// Retorno do OAuth do Mercado Pago (spec 012 RF01, RF02): navegação do navegador, com a sessão
// de quem começou a conexão; volta sempre a Configurações. Fora do OpenAPI: o front não a chama.
@ApiExcludeController()
@Authenticated()
@Controller('payments/oauth')
export class PaymentOAuthController {
  constructor(
    private readonly accounts: PaymentAccountsService,
    private readonly auth: AuthService,
    @InjectPinoLogger(PaymentOAuthController.name) private readonly logger: PinoLogger,
  ) {}

  @Get('callback')
  async callback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
  ): Promise<void> {
    const user = req.user as SessionUser;
    try {
      const weddingId = await this.accounts.completeConnection(req.session, user, code, state);
      return res.redirect(this.auth.panelUrl(`/weddings/${weddingId}/settings?mp=connected`));
    } catch (err) {
      if (!(err instanceof PaymentOAuthFailed)) this.logger.error({ err }, 'payment_oauth_error');
      const weddingId = weddingIdOfState(state);
      const path = weddingId ? `/weddings/${weddingId}/settings` : '/';
      return res.redirect(this.auth.panelUrl(`${path}?mp_error=${OAUTH_FAILED}`));
    }
  }
}
