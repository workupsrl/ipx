'use strict';

const consola = require('consola');
const listhen = require('listhen');
const middleware = require('./shared/ipx.3a2d8cbd.cjs');
require('defu');
require('image-meta');
require('ufo');
require('fs');
require('pathe');
require('http');
require('https');
require('ohmyfetch');
require('destr');
require('etag');
require('xss');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e["default"] : e; }

const consola__default = /*#__PURE__*/_interopDefaultLegacy(consola);

async function main() {
  const ipx = middleware.createIPX({});
  const middleware$1 = middleware.createIPXMiddleware(ipx);
  await listhen.listen(middleware$1, {
    clipboard: false
  });
}
main().catch((err) => {
  consola__default.error(err);
  process.exit(1);
});
