import sharp from 'sharp';
import { MediaInvalidImage } from './errors/media-invalid-image';
import { MediaUnsupportedType } from './errors/media-unsupported-type';
import { processImage, type ProcessedImage } from './image-processing';

// HEIC de 64×48 gerado pelo sips do macOS (o sharp pré-compilado não codifica HEVC).
const HEIC_64x48 = Buffer.from(
  'AAAAJGZ0eXBoZWljAAAAAG1pZjFNaVBybWlhZk1pSEJoZWljAAABhm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAA' +
    'AAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAAjaWluZgAAAAAA' +
    'AQAAABVpbmZlAgAAAAABAABodmMxAAAAAOZpcHJwAAAAxWlwY28AAAATY29scm5jbHgAAgACAAaAAAAADGNsbGkAywBAAAAA' +
    'FGlzcGUAAAAAAAAAQAAAADAAAAAJaXJvdAAAAAAQcGl4aQAAAAADCAgIAAAAcWh2Y0MBA3AAAACwAAAAAAAe8AD8/fj4AAAL' +
    'A6AAAQAXQAEMAf//A3AAAAMAsAAAAwAAAwAecCShAAEAI0IBAQNwAAADALAAAAMAAAMAHqAUIEHBjE4h7kWVTcCAgYAgogAB' +
    'AAlEAcBhcshAUyQAAAAZaXBtYQAAAAAAAAABAAEGgQIDBYaEAAAAHmlsb2MAAAAARAAAAQABAAAAAQAAAboAAAAvAAAAAW1k' +
    'YXQAAAAAAAAAPwAAACsoAa+i9kaBfP/5Yx//2d/svnk4+w2tE6qUfvg+f/9JVP6f/T5uBwmam1R+',
  'base64',
);

const canvas = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 180, g: 90, b: 60 } } });

const variantSizes = async (image: ProcessedImage) =>
  Promise.all(
    image.variants.map(async (variant) => {
      const { width, height, format } = await sharp(variant.body).metadata();
      return { name: variant.name, width, height, format };
    }),
  );

describe('processImage', () => {
  it('generates 640, 1280 and 1920 px WebP and a 1200×630 JPEG from a 4032×3024 photo', async () => {
    const photo = await canvas(4032, 3024).jpeg().toBuffer();

    const image = await processImage(photo);

    expect(image).toMatchObject({ format: 'jpeg', width: 4032, height: 3024 });
    await expect(variantSizes(image)).resolves.toEqual([
      { name: 'sm', width: 640, height: 480, format: 'webp' },
      { name: 'md', width: 1280, height: 960, format: 'webp' },
      { name: 'lg', width: 1920, height: 1440, format: 'webp' },
      { name: 'og', width: 1200, height: 630, format: 'jpeg' },
    ]);
  }, 30_000);

  it('never enlarges a 500 px photo in the WebP versions', async () => {
    const image = await processImage(await canvas(500, 400).png().toBuffer());

    const sizes = await variantSizes(image);
    expect(sizes.filter((size) => size.format === 'webp').map((size) => size.width)).toEqual([
      500, 500, 500,
    ]);
    expect(sizes.find((size) => size.name === 'og')).toMatchObject({ width: 1200, height: 630 });
  });

  it('applies a 90° EXIF orientation, so a sideways photo comes out standing', async () => {
    const sideways = await canvas(400, 300).jpeg().withMetadata({ orientation: 6 }).toBuffer();

    const image = await processImage(sideways);

    expect(image).toMatchObject({ width: 300, height: 400 });
    const [sm] = await variantSizes(image);
    expect(sm).toMatchObject({ width: 300, height: 400 });
  });

  it('drops EXIF, including GPS, from every version', async () => {
    const withGps = await canvas(800, 600)
      .jpeg()
      .withExif({
        IFD0: { Make: 'Phone' },
        IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '23/1 33/1 0/1' },
      })
      .toBuffer();
    expect((await sharp(withGps).metadata()).exif).toBeDefined();

    const image = await processImage(withGps);

    for (const variant of image.variants) {
      const metadata = await sharp(variant.body).metadata();
      expect(metadata.exif).toBeUndefined();
      expect(metadata.orientation).toBeUndefined();
    }
  });

  it('decodes HEIC through heic-decode and generates the versions', async () => {
    const image = await processImage(HEIC_64x48);

    expect(image).toMatchObject({ format: 'heic', width: 64, height: 48 });
    const sizes = await variantSizes(image);
    expect(sizes.map((size) => size.name)).toEqual(['sm', 'md', 'lg', 'og']);
    expect(sizes[0]).toMatchObject({ width: 64, height: 48, format: 'webp' });
  });

  it('decodes AVIF and WebP straight with sharp', async () => {
    const avif = await processImage(await canvas(120, 80).avif().toBuffer());
    const webp = await processImage(await canvas(120, 80).webp().toBuffer());

    expect(avif).toMatchObject({ format: 'avif', width: 120, height: 80 });
    expect(webp).toMatchObject({ format: 'webp', width: 120, height: 80 });
    expect(avif.variants).toHaveLength(4);
  });

  it('flattens transparency on the og JPEG', async () => {
    const transparent = await sharp({
      create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();

    const image = await processImage(transparent);

    const og = image.variants.find((variant) => variant.name === 'og');
    expect((await sharp(og.body).metadata()).hasAlpha).toBe(false);
  });

  it('rejects SVG content as an unsupported type', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');

    await expect(processImage(svg)).rejects.toBeInstanceOf(MediaUnsupportedType);
  });

  it('rejects a truncated JPEG as an invalid image', async () => {
    const photo = await canvas(1600, 1200).jpeg().toBuffer();

    await expect(processImage(photo.subarray(0, photo.length / 2))).rejects.toBeInstanceOf(
      MediaInvalidImage,
    );
  });

  it('rejects a corrupted HEIC as an invalid image', async () => {
    const broken = Buffer.concat([HEIC_64x48.subarray(0, 120), Buffer.alloc(40)]);

    await expect(processImage(broken)).rejects.toBeInstanceOf(MediaInvalidImage);
  });
});
