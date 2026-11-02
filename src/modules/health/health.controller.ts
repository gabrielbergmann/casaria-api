import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Public } from '../../common/auth/access.decorators';
import { HealthDto } from './dto/health.dto';

@ApiTags('health')
@Controller('health')
export class HealthController {
  // Não consulta dependências: responde se o processo está de pé (RF08).
  @Get()
  @Public()
  @ZodResponse({ status: 200, type: HealthDto })
  check() {
    return { status: 'ok' as const };
  }
}
