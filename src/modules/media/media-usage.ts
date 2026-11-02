/**
 * Verificador de uso de imagem (spec 006 RF09). `media` não importa quem usa as imagens: site
 * (007), gifts (011) e álbum (014) implementam e se registram no MediaService ao iniciar.
 */
export interface MediaUsageChecker {
  /** Nome do lugar devolvido em `usedIn`, ex.: "site". */
  readonly place: string;
  isInUse(weddingId: string, mediaId: string): Promise<boolean>;
}
