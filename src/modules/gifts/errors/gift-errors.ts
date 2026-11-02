import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

// Erros do catálogo de presentes (spec 011 RNF03). gift.sold_out é da 012.

export class GiftNotFound extends DomainError {
  readonly code = 'gift.not_found';
  readonly status = HttpStatus.NOT_FOUND;
  readonly title = 'Presente não encontrado.';
}

export class GiftInvalidMedia extends DomainError {
  readonly code = 'gift.invalid_media';
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly title = 'A foto escolhida não existe mais. Envie outra.';
}

export class GiftInvalidCategory extends DomainError {
  readonly code = 'gift.invalid_category';
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly title = 'A categoria escolhida não existe mais. Escolha outra.';
}

export class GiftInvalidOrder extends DomainError {
  readonly code = 'gift.invalid_order';
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly title = 'A nova ordem precisa trazer cada presente da lista uma única vez.';
}

export class GiftLocked extends DomainError {
  readonly code = 'gift.locked';
  readonly status = HttpStatus.CONFLICT;
  readonly title = 'Com cotas vendidas ou reservadas, o tipo e o valor da cota não mudam.';
}

export class GiftQuotaTotalTooLow extends DomainError {
  readonly code = 'gift.quota_total_too_low';
  readonly status = HttpStatus.CONFLICT;
  readonly title = 'O total de cotas não pode ficar abaixo das vendidas e reservadas.';
}

export class GiftCategoryNotFound extends DomainError {
  readonly code = 'gift_category.not_found';
  readonly status = HttpStatus.NOT_FOUND;
  readonly title = 'Categoria não encontrada.';
}

export class GiftCategoryNameTaken extends DomainError {
  readonly code = 'gift_category.name_taken';
  readonly status = HttpStatus.CONFLICT;
  readonly title = 'Já existe uma categoria com este nome.';
}

export class GiftSoldOut extends DomainError {
  readonly code = 'gift.sold_out';
  readonly status = HttpStatus.CONFLICT;
  readonly title = 'Não há cotas suficientes deste presente.';
}

export class GiftInvalidAmount extends DomainError {
  readonly code = 'gift.invalid_amount';
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly title = 'Informe o valor do presente.';
}
