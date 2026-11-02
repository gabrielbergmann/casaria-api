import { Module } from '@nestjs/common';
import { Clock } from '../../common/time/clock';
import { MercadoPagoProvider } from '../../infra/mercadopago/mercadopago.provider';
import { AuthModule } from '../auth/auth.module';
import { GiftsModule } from '../gifts/gifts.module';
import { SiteModule } from '../site/site.module';
import { WeddingsModule } from '../weddings/weddings.module';
import { PaymentAccountsRepository } from './accounts/payment-accounts.repository';
import { PaymentAccountsService } from './accounts/payment-accounts.service';
import { PaymentFeesRepository } from './fees/payment-fees.repository';
import { PaymentFeesService } from './fees/payment-fees.service';
import { CheckoutService } from './orders/checkout.service';
import { OrderSyncService } from './orders/order-sync.service';
import { OrderTransitionsService } from './orders/order-transitions.service';
import { OrdersAnonymizer } from './orders/orders-anonymizer';
import { OrdersRepository } from './orders/orders.repository';
import { PaymentAccountController } from './payment-account.controller';
import { PaymentFeesController } from './payment-fees.controller';
import { PaymentOAuthController } from './payment-oauth.controller';
import { PixKeyController } from './pix-key.controller';
import { PixKeysRepository } from './pix/pix-keys.repository';
import { PixKeysService } from './pix/pix-keys.service';
import { PAYMENT_PROVIDER } from './provider/payment-provider';
import { PublicCheckoutController } from './public-checkout.controller';
import { ReceivedGiftsController } from './received-gifts.controller';
import { DirectPixReviewService } from './received/direct-pix-review.service';
import { ReceivedGiftsService } from './received/received-gifts.service';
import { ThanksService } from './received/thanks.service';
import { PaymentRoutines } from './routines/payment-routines';
import { WebhookEventsRepository } from './webhooks/webhook-events.repository';
import { MercadoPagoWebhookService } from './webhooks/mercadopago-webhook.service';
import { WebhooksController } from './webhooks.controller';

// Pagamentos (spec 012): usa gifts (cotas) e nunca o contrário; Recebidos e o agradecido da 014
// moram aqui. O Mercado Pago fica atrás do PAYMENT_PROVIDER (PRD ADR-010).
@Module({
  imports: [GiftsModule, WeddingsModule, SiteModule, AuthModule],
  controllers: [
    PaymentAccountController,
    PaymentOAuthController,
    PaymentFeesController,
    PixKeyController,
    ReceivedGiftsController,
    PublicCheckoutController,
    WebhooksController,
  ],
  providers: [
    { provide: PAYMENT_PROVIDER, useClass: MercadoPagoProvider },
    PaymentAccountsService,
    PaymentAccountsRepository,
    PaymentFeesService,
    PaymentFeesRepository,
    PixKeysService,
    PixKeysRepository,
    OrdersRepository,
    OrdersAnonymizer,
    OrderTransitionsService,
    OrderSyncService,
    CheckoutService,
    WebhookEventsRepository,
    MercadoPagoWebhookService,
    ReceivedGiftsService,
    DirectPixReviewService,
    ThanksService,
    PaymentRoutines,
    Clock,
  ],
  exports: [ReceivedGiftsService],
})
export class PaymentsModule {}
