import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { SuperadminOnly } from '../../common/auth/access.decorators';
import { AuthService } from '../auth/auth.service';
import {
  CreatePasswordResetLinkDto,
  PasswordResetLinkDto,
} from '../auth/dto/password-reset-link.dto';
import { AdminService } from './admin.service';
import { AdminWeddingDto, CreatedWeddingDto, CreateWeddingDto } from './dto/admin-wedding.dto';

// Rotas do superadmin, sem regra própria: delegam aos services dos módulos donos.
@ApiTags('admin')
@Controller('admin')
@SuperadminOnly()
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly auth: AuthService,
  ) {}

  @Post('weddings')
  @ZodResponse({ status: 201, type: CreatedWeddingDto })
  async createWedding(@Body() body: CreateWeddingDto) {
    const { weddingId, invitation } = await this.admin.createWedding({
      ...body,
      weddingDate: new Date(body.weddingDate),
    });
    const { email, role, expiresAt, link } = invitation;
    return { weddingId, invitation: { email, role, expiresAt: expiresAt.toISOString(), link } };
  }

  @Get('weddings')
  @ZodResponse({ status: 200, type: [AdminWeddingDto] })
  async listWeddings() {
    const weddings = await this.admin.listWeddings();
    return weddings.map((wedding) => ({
      ...wedding,
      weddingDate: wedding.weddingDate.toISOString(),
    }));
  }

  @Post('password-reset-links')
  @ZodResponse({ status: 201, type: PasswordResetLinkDto })
  createPasswordResetLink(@Body() body: CreatePasswordResetLinkDto) {
    return this.auth.createPasswordResetLink(body.email);
  }
}
