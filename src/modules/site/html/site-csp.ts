// CSP do HTML do site (spec 007 RNF02, skill seguranca §7): a própria origem, a API, o storage
// das imagens, o Google Fonts e o SDK e o Card Payment Brick do Mercado Pago (spec 012: script,
// estilos e fontes do mlstatic, chamadas de tokenização e iframes dos campos seguros). O 'unsafe-inline' em style-src cobre o
// atributo style com as variáveis --site-* do tema e os estilos que o Brick injeta.
const MP_SDK = 'https://sdk.mercadopago.com';
const MP_STATIC = 'https://http2.mlstatic.com';
const MP_API = 'https://api.mercadopago.com https://api.mercadolibre.com';
const MP_FRAMES = 'https://*.mercadopago.com https://*.mercadolibre.com';

export function buildSiteCsp(origins: { api: string; storage: string }): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${MP_SDK} ${MP_STATIC}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com ${MP_STATIC}`,
    `font-src 'self' https://fonts.gstatic.com ${MP_STATIC}`,
    `img-src 'self' data: ${origins.storage} https://*.mlstatic.com ${MP_FRAMES}`,
    `connect-src 'self' ${origins.api} ${MP_API} ${MP_FRAMES}`,
    `frame-src ${MP_FRAMES}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}
