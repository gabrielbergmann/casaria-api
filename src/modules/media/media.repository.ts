import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface NewMedia {
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
}

export interface MediaRecord {
  id: string;
  width: number;
  height: number;
  createdAt: Date;
}

const RECORD = { id: true, width: true, height: true, createdAt: true } as const;

@Injectable()
export class MediaRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(weddingId: string, data: NewMedia): Promise<MediaRecord> {
    return this.prisma.media.create({ data: { ...data, weddingId }, select: RECORD });
  }

  async exists(weddingId: string, mediaId: string): Promise<boolean> {
    const media = await this.prisma.media.findFirst({
      where: { id: mediaId, weddingId },
      select: { id: true },
    });
    return media !== null;
  }

  /** Mais recentes primeiro; `take` + 1 itens para saber se há próxima página. */
  listPage(weddingId: string, cursor: string | undefined, take: number): Promise<MediaRecord[]> {
    return this.prisma.media.findMany({
      where: { weddingId, id: cursor ? { lt: cursor } : undefined },
      orderBy: { id: 'desc' },
      take: take + 1,
      select: RECORD,
    });
  }

  /** Uma consulta para a lista toda; ids de outro casamento simplesmente não voltam. */
  findMany(weddingId: string, mediaIds: string[]): Promise<MediaRecord[]> {
    return this.prisma.media.findMany({
      where: { weddingId, id: { in: mediaIds } },
      select: RECORD,
    });
  }

  async delete(weddingId: string, mediaId: string): Promise<void> {
    await this.prisma.media.deleteMany({ where: { id: mediaId, weddingId } });
  }
}
