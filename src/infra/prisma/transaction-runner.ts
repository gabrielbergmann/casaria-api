import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from './prisma.service';

export type Tx = Prisma.TransactionClient;

// Atomicidade entre módulos (skill database): o service abre a transação e passa o tx aos
// repositories, que o aceitam como último parâmetro. Nada de HTTP dentro dela.
@Injectable()
export class TransactionRunner {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}
