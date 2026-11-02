import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Roles } from '../../common/auth/access.decorators';
import { ApiWeddingParam } from '../../common/tenant/api-wedding-param';
import { Tenant, type TenantContext } from '../../common/tenant/tenant-context';
import { ListMediaQueryDto, MediaDto, MediaPageDto } from './dto/media.dto';
import { MediaFileRequired } from './errors/media-file-required';
import { MediaUploadInterceptor } from './media-upload.interceptor';
import { type MediaListItem, MediaService } from './media.service';

/** Só o conteúdo do arquivo chega ao service; o nome enviado nunca é lido. */
interface UploadedImage {
  buffer: Buffer;
}

const toDto = (media: MediaListItem) => ({ ...media, createdAt: media.createdAt.toISOString() });

// Imagem é conteúdo: owner e editor (PRD RF38).
@ApiTags('media')
@ApiWeddingParam()
@Roles('owner', 'editor')
@Controller('weddings/:weddingId/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @UseInterceptors(MediaUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ZodResponse({ status: 201, type: MediaDto })
  async upload(@Tenant() tenant: TenantContext, @UploadedFile() file: UploadedImage | undefined) {
    if (!file?.buffer?.length) throw new MediaFileRequired();
    return toDto(await this.media.upload(tenant.weddingId, file.buffer));
  }

  @Get()
  @ZodResponse({ status: 200, type: MediaPageDto })
  async list(@Tenant() tenant: TenantContext, @Query() query: ListMediaQueryDto) {
    const page = await this.media.list(tenant.weddingId, query.cursor);
    return { items: page.items.map(toDto), nextCursor: page.nextCursor };
  }

  @Delete(':mediaId')
  @HttpCode(204)
  async delete(@Tenant() tenant: TenantContext, @Param('mediaId') mediaId: string): Promise<void> {
    await this.media.delete(tenant.weddingId, mediaId);
  }
}
