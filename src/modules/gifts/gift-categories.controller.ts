import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { Roles } from '../../common/auth/access.decorators';
import { ApiWeddingParam } from '../../common/tenant/api-wedding-param';
import { Tenant, type TenantContext } from '../../common/tenant/tenant-context';
import { GiftCategoryDto, GiftCategoryInputDto, GiftCategoryListDto } from './dto/gift.dto';
import { GiftCategoriesService } from './gift-categories.service';

// Categorias de presentes (spec 011 RF07): owner e editor.
@ApiTags('gifts')
@ApiWeddingParam()
@Roles('owner', 'editor')
@Controller('weddings/:weddingId/gift-categories')
export class GiftCategoriesController {
  constructor(private readonly categories: GiftCategoriesService) {}

  @Get()
  @ZodResponse({ status: 200, type: GiftCategoryListDto })
  async list(@Tenant() tenant: TenantContext) {
    return { categories: await this.categories.list(tenant.weddingId) };
  }

  @Post()
  @ZodResponse({ status: 201, type: GiftCategoryDto })
  create(@Tenant() tenant: TenantContext, @Body() body: GiftCategoryInputDto) {
    return this.categories.create(tenant.weddingId, body.name);
  }

  @Put(':categoryId')
  @ZodResponse({ status: 200, type: GiftCategoryDto })
  rename(
    @Tenant() tenant: TenantContext,
    @Param('categoryId') categoryId: string,
    @Body() body: GiftCategoryInputDto,
  ) {
    return this.categories.rename(tenant.weddingId, categoryId, body.name);
  }

  @Delete(':categoryId')
  @HttpCode(204)
  async delete(
    @Tenant() tenant: TenantContext,
    @Param('categoryId') categoryId: string,
  ): Promise<void> {
    await this.categories.delete(tenant.weddingId, categoryId);
  }
}
