import { detectImageFormat } from './image-format';

const ftyp = (major: string, ...compatible: string[]) => {
  const brands = Buffer.from([major, '\0\0\0\0', ...compatible].join(''), 'latin1');
  const size = Buffer.alloc(4);
  size.writeUInt32BE(8 + brands.length);
  return Buffer.concat([size, Buffer.from('ftyp', 'latin1'), brands, Buffer.alloc(16)]);
};

describe('detectImageFormat', () => {
  it.each([
    ['jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])],
    ['png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])],
    ['webp', Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1')])],
    ['heic', ftyp('heic', 'mif1', 'heic')],
    ['heic', ftyp('mif1', 'MiPr', 'heic')],
    ['avif', ftyp('avif', 'mif1', 'avif', 'miaf')],
    ['avif', ftyp('mif1', 'avif')],
  ])('recognizes %s by its first bytes', (format, buffer) => {
    expect(detectImageFormat(buffer)).toBe(format);
  });

  it.each([
    ['SVG', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'],
    ['SVG with an XML prolog', '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'],
    ['HTML', '<!doctype html><html><body><img src=x onerror=alert(1)></body></html>'],
    ['GIF', 'GIF89a\u0001\u0000\u0001\u0000'],
    ['plain text', 'not an image at all'],
  ])('rejects %s whatever the name or Content-Type', (_label, content) => {
    expect(detectImageFormat(Buffer.from(content, 'latin1'))).toBeNull();
  });

  it('rejects a HEIF container without a HEIC or AVIF brand', () => {
    expect(detectImageFormat(ftyp('mif1', 'miaf'))).toBeNull();
  });

  it('rejects an empty file', () => {
    expect(detectImageFormat(Buffer.alloc(0))).toBeNull();
  });
});
