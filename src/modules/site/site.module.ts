import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { Clock } from '../../common/time/clock';
import { MediaModule } from '../media/media.module';
import { WeddingsModule } from '../weddings/weddings.module';
import { SiteHtmlMiddleware } from './html/site-html.middleware';
import { PublicSiteController } from './public-site.controller';
import { SiteController } from './site.controller';
import { SiteRepository } from './site.repository';
import { SiteService } from './site.service';
import { ThemeOptionsController } from './theme-options.controller';

// Exporta o SiteService: quem usa o PublicTenantGuard (010, 011, 013) importa este módulo.
@Module({
  imports: [WeddingsModule, MediaModule],
  controllers: [SiteController, ThemeOptionsController, PublicSiteController],
  providers: [SiteService, SiteRepository, SiteHtmlMiddleware, Clock],
  exports: [SiteService],
})
export class SiteModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SiteHtmlMiddleware).forRoutes({ path: '{/*splat}', method: RequestMethod.ALL });
  }
}
