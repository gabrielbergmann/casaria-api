import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

// audit_logs é global (sem filtro por casamento) e só recebe inserções.
@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.AuditLogUncheckedCreateInput): Promise<void> {
    await this.prisma.auditLog.create({ data });
  }
}
