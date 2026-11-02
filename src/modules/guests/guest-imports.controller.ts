import {
  Controller,
  Get,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Roles } from '../../common/auth/access.decorators';
import { ApiWeddingParam } from '../../common/tenant/api-wedding-param';
import { Tenant, type TenantContext } from '../../common/tenant/tenant-context';
import { GuestImportResultDto } from './dto/guests.dto';
import { GuestImportInvalidFile } from './errors/guest-import-errors';
import { GuestImportUploadInterceptor } from './guest-import-upload.interceptor';
import { GuestImportService } from './guest-import.service';
import { buildTemplate, TEMPLATE_FILENAME, XLSX_CONTENT_TYPE } from './guest-template';

/** Só o conteúdo do arquivo chega ao service; o nome enviado nunca é lido. */
interface UploadedSpreadsheet {
  buffer: Buffer;
}

// Planilha modelo e importação (spec 009 RF05, RF06, RF10): owner e editor.
@ApiTags('guests')
@ApiWeddingParam()
@Roles('owner', 'editor')
@Controller('weddings/:weddingId/guest-imports')
export class GuestImportsController {
  constructor(private readonly imports: GuestImportService) {}

  @Get('template')
  @ApiProduces(XLSX_CONTENT_TYPE)
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async template(): Promise<StreamableFile> {
    return new StreamableFile(await buildTemplate(), {
      type: XLSX_CONTENT_TYPE,
      disposition: `attachment; filename="${TEMPLATE_FILENAME}"`,
    });
  }

  @Post()
  @UseInterceptors(GuestImportUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ZodResponse({ status: 200, type: GuestImportResultDto })
  async import(
    @Tenant() tenant: TenantContext,
    @UploadedFile() file: UploadedSpreadsheet | undefined,
  ) {
    if (!file?.buffer?.length) throw new GuestImportInvalidFile();
    return this.imports.import(tenant.weddingId, file.buffer);
  }
}
