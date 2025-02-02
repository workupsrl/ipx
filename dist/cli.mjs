import consola from 'consola';
import { listen } from 'listhen';
import { c as createIPX, a as createIPXMiddleware } from './shared/ipx.4c8f3706.mjs';
import 'defu';
import 'image-meta';
import 'ufo';
import 'fs';
import 'pathe';
import 'http';
import 'https';
import 'ohmyfetch';
import 'destr';
import 'etag';
import 'xss';

async function main() {
  const ipx = createIPX({});
  const middleware = createIPXMiddleware(ipx);
  await listen(middleware, {
    clipboard: false
  });
}
main().catch((err) => {
  consola.error(err);
  process.exit(1);
});
