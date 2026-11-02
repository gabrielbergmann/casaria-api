import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { isUniqueViolation } from '../../infra/prisma/unique-violation';
import { GiftCategoryNameTaken, GiftCategoryNotFound } from './errors/gift-errors';
import { GiftCategoriesRepository, type GiftCategoryRecord } from './gift-categories.repository';

const isUuid = (value: string) => z.uuid().safeParse(value).success;

/** Nome repetido no casamento vira gift_category.name_taken (RF07). */
async function uniqueName<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) throw new GiftCategoryNameTaken();
    throw error;
  }
}

// Categorias criadas pelo casal (spec 011 RF07): sem ordem manual, por nome.
@Injectable()
export class GiftCategoriesService {
  constructor(private readonly repository: GiftCategoriesRepository) {}

  list(weddingId: string): Promise<GiftCategoryRecord[]> {
    return this.repository.list(weddingId);
  }

  create(weddingId: string, name: string): Promise<GiftCategoryRecord> {
    return uniqueName(() => this.repository.create(weddingId, name));
  }

  async rename(weddingId: string, categoryId: string, name: string): Promise<GiftCategoryRecord> {
    const renamed =
      isUuid(categoryId) &&
      (await uniqueName(() => this.repository.rename(weddingId, categoryId, name)));
    if (!renamed) throw new GiftCategoryNotFound();
    return { id: categoryId, name };
  }

  /** Os presentes dela seguem ativos e ficam sem categoria. */
  async delete(weddingId: string, categoryId: string): Promise<void> {
    if (!isUuid(categoryId) || !(await this.repository.delete(weddingId, categoryId))) {
      throw new GiftCategoryNotFound();
    }
  }
}
