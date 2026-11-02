import { Module } from '@nestjs/common';
import { Clock } from '../../common/time/clock';
import { MediaModule } from '../media/media.module';
import { SiteModule } from '../site/site.module';
import { GiftCategoriesController } from './gift-categories.controller';
import { GiftCategoriesRepository } from './gift-categories.repository';
import { GiftCategoriesService } from './gift-categories.service';
import { GiftsController } from './gifts.controller';
import { GiftsRepository } from './gifts.repository';
import { GiftsService } from './gifts.service';
import { GuestbookController } from './guestbook.controller';
import { GuestbookRepository } from './guestbook.repository';
import { GuestbookService } from './guestbook.service';
import { PublicGiftsController } from './public-gifts.controller';
import { PublicGuestbookController } from './public-guestbook.controller';

// Presentes (spec 011) e mural de recados (spec 013). Exporta o GiftsService para payments (012);
// nunca importa payments. O SiteModule entra pelo PublicTenantGuard e pela seção ativa do mural.
@Module({
  imports: [MediaModule, SiteModule],
  controllers: [
    GiftsController,
    GiftCategoriesController,
    PublicGiftsController,
    GuestbookController,
    PublicGuestbookController,
  ],
  providers: [
    GiftsService,
    GiftCategoriesService,
    GiftsRepository,
    GiftCategoriesRepository,
    GuestbookService,
    GuestbookRepository,
    Clock,
  ],
  exports: [GiftsService],
})
export class GiftsModule {}
