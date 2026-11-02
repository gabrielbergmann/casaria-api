import type { PinoLogger } from 'nestjs-pino';

/**
 * Laço das rotinas que atravessam casamentos (spec 003 RF14): um casamento por vez, cada um
 * com o seu weddingId no log; a falha de um não interrompe os outros.
 */
export async function forEachWedding(
  weddingIds: string[],
  task: (weddingId: string) => Promise<void>,
  logger: PinoLogger,
): Promise<void> {
  for (const weddingId of weddingIds) {
    await logger.runInContext(
      async () => {
        try {
          await task(weddingId);
        } catch (err) {
          logger.error({ err }, 'wedding_task_failed');
        }
      },
      { bindings: { weddingId } },
    );
  }
}
