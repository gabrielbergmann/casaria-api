// Erro interno: a mensagem nunca leva o texto cifrado, o original nem a chave.
export class DecryptionFailed extends Error {
  constructor() {
    super('Não foi possível decifrar o valor: dado adulterado ou chave incorreta.');
    this.name = 'DecryptionFailed';
  }
}
