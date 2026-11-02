// Tipos mínimos do heic-decode (ADR-001 da spec 006), que não publica declarações.
declare module 'heic-decode' {
  interface DecodedImage {
    width: number;
    height: number;
    /** RGBA, 4 bytes por pixel. */
    data: Uint8ClampedArray;
  }

  interface HeifImage {
    width: number;
    height: number;
    decode(): Promise<DecodedImage>;
  }

  function decode(input: { buffer: Buffer | Uint8Array }): Promise<DecodedImage>;

  namespace decode {
    function all(input: {
      buffer: Buffer | Uint8Array;
    }): Promise<HeifImage[] & { dispose(): void }>;
  }

  export = decode;
}
