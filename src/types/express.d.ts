// El `verify` de express.json() en src/index.ts guarda el body crudo acá,
// para poder validar la firma HMAC del webhook en src/filters.ts.
import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    rawBody?: Buffer;
  }
}
