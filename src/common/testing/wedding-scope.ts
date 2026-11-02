// Apoio aos testes de isolamento (skill multi-tenant): cada chamada ao Prisma de uma tabela
// de casamento precisa levar o weddingId no where (inclusive em chave composta) ou no data.

type PrismaArgs = { where?: Record<string, unknown>; data?: Record<string, unknown> };

function whereWeddingId(where: Record<string, unknown> = {}): unknown {
  if ('weddingId' in where) return where.weddingId;
  const compound = Object.values(where).find(
    (value) => typeof value === 'object' && value !== null && 'weddingId' in value,
  ) as { weddingId?: unknown } | undefined;
  return compound?.weddingId;
}

export function expectWeddingScoped(mock: jest.Mock, weddingId: string): void {
  if (mock.mock.calls.length === 0) throw new Error('a consulta não foi chamada');
  for (const [args] of mock.mock.calls as [PrismaArgs][]) {
    const scoped = whereWeddingId(args?.where) === weddingId || args?.data?.weddingId === weddingId;
    if (!scoped) {
      throw new Error(`consulta sem weddingId ${weddingId}: ${JSON.stringify(args)}`);
    }
  }
}
