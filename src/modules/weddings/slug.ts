// Regras de slug do PRD RF03 (spec 003 RF02).
export const RESERVED_SLUGS = new Set([
  'www',
  'app',
  'api',
  'admin',
  'mail',
  'blog',
  'help',
  'status',
  'cdn',
  'static',
  'assets',
  // Subdomínios da infraestrutura de produção: painel do Easypanel e storage das fotos.
  'infra',
  'files',
]);

// Minúsculas, números e hífen, sem hífen no início, no fim ou repetido.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 63;

export function isValidSlug(slug: string): boolean {
  return (
    slug.length >= SLUG_MIN_LENGTH &&
    slug.length <= SLUG_MAX_LENGTH &&
    SLUG_PATTERN.test(slug) &&
    !RESERVED_SLUGS.has(slug)
  );
}
