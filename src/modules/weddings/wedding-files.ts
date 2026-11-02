/**
 * Arquivos do casamento no storage, apagados antes do banco na exclusão (spec 005 RF11). Ligado
 * ao MediaService (spec 006 RF12), que apaga tudo sob weddings/{weddingId}/.
 */
export const WEDDING_FILES = Symbol('WEDDING_FILES');

export interface WeddingFiles {
  deleteWeddingFiles(weddingId: string): Promise<void>;
}
