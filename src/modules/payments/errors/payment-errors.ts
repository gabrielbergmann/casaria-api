import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';

// Erros de pagamentos (spec 012). gift.sold_out vem do módulo gifts.

export class PaymentOAuthFailed extends DomainError {
  readonly code = 'payment.oauth_failed';
  readonly status = HttpStatus.BAD_REQUEST;
  readonly title = 'Não foi possível conectar a conta Mercado Pago. Tente de novo.';
}

export class PaymentAccountDisconnected extends DomainError {
  readonly code = 'payment.account_disconnected';
  readonly status = HttpStatus.CONFLICT;
  readonly title = 'O casal ainda não pode receber presentes por aqui.';
}

export class PaymentInvalidFee extends DomainError {
  readonly code = 'payment.invalid_fee';
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly title = 'Use percentual de 0 a 99,99% e valor fixo de zero ou mais.';
}

export class PaymentInvalidSignature extends DomainError {
  readonly code = 'payment.invalid_signature';
  readonly status = HttpStatus.UNAUTHORIZED;
  readonly title = 'Assinatura da notificação inválida.';
}

export class PaymentOrderNotFound extends DomainError {
  readonly code = 'payment.order_not_found';
  readonly status = HttpStatus.NOT_FOUND;
  readonly title = 'Pedido não encontrado.';
}

export class PaymentOrderNotPending extends DomainError {
  readonly code = 'payment.order_not_pending';
  readonly status = HttpStatus.CONFLICT;
  readonly title = 'Este pedido já foi encerrado. Comece um novo.';
}

export class PaymentInvalidPixKey extends DomainError {
  readonly code = 'payment.invalid_pix_key';
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly title = 'Chave Pix inválida para o tipo escolhido.';
}

export class PaymentOrderNotAwaiting extends DomainError {
  readonly code = 'payment.order_not_awaiting';
  readonly status = HttpStatus.CONFLICT;
  readonly title = 'Este presente não está mais esperando conferência.';
}

export class PaymentChargeFailed extends DomainError {
  readonly code = 'payment.charge_failed';
  readonly status = HttpStatus.BAD_GATEWAY;
  readonly title = 'Não foi possível gerar a cobrança. Comece de novo em instantes.';
}

// Agradecido (spec 014).

export class ContributionNotFound extends DomainError {
  readonly code = 'contribution.not_found';
  readonly status = HttpStatus.NOT_FOUND;
  readonly title = 'Presente recebido não encontrado.';
}

export class ContributionThanksNotOpen extends DomainError {
  readonly code = 'contribution.thanks_not_open';
  readonly status = HttpStatus.CONFLICT;
  readonly title = 'A marcação de agradecido abre depois do casamento.';
}
