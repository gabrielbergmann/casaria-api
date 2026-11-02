import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface GiftCategoryRecord {
  id: string;
  name: string;
}

const CATEGORY = { id: true, name: true } as const;

// Categorias do casal (spec 011 RF07). Todo método recebe o weddingId e filtra por ele (RNF01).
@Injectable()
export class GiftCategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(weddingId: string): Promise<GiftCategoryRecord[]> {
    return this.prisma.giftCategory.findMany({
      where: { weddingId },
      select: CATEGORY,
      orderBy: { name: 'asc' },
    });
  }

  /** Só as que têm presente ativo: o filtro da vitrine (RF09). */
  listWithActiveGifts(weddingId: string): Promise<GiftCategoryRecord[]> {
    return this.prisma.giftCategory.findMany({
      where: { weddingId, gifts: { some: { weddingId, deletedAt: null } } },
      select: CATEGORY,
      orderBy: { name: 'asc' },
    });
  }

  async exists(weddingId: string, categoryId: string): Promise<boolean> {
    const count = await this.prisma.giftCategory.count({ where: { id: categoryId, weddingId } });
    return count > 0;
  }

  /** Nome repetido no casamento lança a violação de unicidade (P2002). */
  create(weddingId: string, name: string): Promise<GiftCategoryRecord> {
    return this.prisma.giftCategory.create({ data: { weddingId, name }, select: CATEGORY });
  }

  async rename(weddingId: string, categoryId: string, name: string): Promise<boolean> {
    const { count } = await this.prisma.giftCategory.updateMany({
      where: { id: categoryId, weddingId },
      data: { name },
    });
    return count === 1;
  }

  /** Os presentes dela seguem, sem categoria (RF07), inclusive os excluídos. */
  async delete(weddingId: string, categoryId: string): Promise<boolean> {
    const [, deleted] = await this.prisma.$transaction([
      this.prisma.gift.updateMany({
        where: { weddingId, categoryId },
        data: { categoryId: null },
      }),
      this.prisma.giftCategory.deleteMany({ where: { id: categoryId, weddingId } }),
    ]);
    return deleted.count === 1;
  }
}
