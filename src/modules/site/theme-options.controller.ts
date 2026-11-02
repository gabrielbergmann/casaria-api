import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Authenticated } from '../../common/auth/access.decorators';
import { ThemeOptionsDto } from './dto/site.dto';
import { FONT_FAMILIES, PALETTES } from './theme-options';

// Fontes e paletas do editor (spec 007 RF10): o front não tem cópia própria.
@ApiTags('site')
@Controller('site')
export class ThemeOptionsController {
  @Get('theme-options')
  @Authenticated()
  @ZodResponse({ status: 200, type: ThemeOptionsDto })
  get() {
    return { fonts: [...FONT_FAMILIES], palettes: PALETTES };
  }
}
