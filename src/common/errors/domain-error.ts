// Erro de domínio: o service lança, o ProblemDetailsFilter converte em RFC 9457.
export abstract class DomainError extends Error {
  /** Código estável no formato dominio.motivo, consumido pelo front. */
  abstract readonly code: string;
  abstract readonly status: number;
  /** Título em pt-BR. */
  abstract readonly title: string;

  constructor() {
    super();
    this.name = new.target.name;
  }

  /** Membros extras do Problem Details (RFC 9457), ex.: `usedIn` de media.in_use. */
  get extensions(): Record<string, unknown> | undefined {
    return undefined;
  }

  /** Cabeçalhos da resposta de erro, ex.: `Retry-After` de invitation.code_blocked. */
  get headers(): Record<string, string> | undefined {
    return undefined;
  }
}
