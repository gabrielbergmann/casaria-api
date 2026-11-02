import { Prisma } from '../../generated/prisma/client';

/** Violação de índice único (disputa simultânea por slug, email ou vínculo). */
export const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
