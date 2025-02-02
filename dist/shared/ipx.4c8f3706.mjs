import defu from 'defu';
import { imageMeta } from 'image-meta';
import { withLeadingSlash, hasProtocol, joinURL, decode } from 'ufo';
import { promises } from 'fs';
import { resolve, join, parse } from 'pathe';
import http from 'http';
import https from 'https';
import { fetch } from 'ohmyfetch';
import destr from 'destr';
import getEtag from 'etag';
import xss from 'xss';

const Handlers = {
  __proto__: null,
  get quality () { return quality; },
  get fit () { return fit; },
  get position () { return position; },
  get background () { return background; },
  get enlarge () { return enlarge; },
  get width () { return width; },
  get height () { return height; },
  get resize () { return resize; },
  get trim () { return trim; },
  get extend () { return extend; },
  get extract () { return extract; },
  get rotate () { return rotate; },
  get flip () { return flip; },
  get flop () { return flop; },
  get sharpen () { return sharpen; },
  get median () { return median; },
  get blur () { return blur; },
  get flatten () { return flatten; },
  get gamma () { return gamma; },
  get negate () { return negate; },
  get normalize () { return normalize; },
  get threshold () { return threshold; },
  get modulate () { return modulate; },
  get tint () { return tint; },
  get grayscale () { return grayscale; },
  get crop () { return crop; },
  get q () { return q; },
  get b () { return b; },
  get w () { return w; },
  get h () { return h; },
  get s () { return s; },
  get pos () { return pos; }
};

function getEnv(name, defaultValue) {
  return destr(process.env[name]) ?? defaultValue;
}
function cachedPromise(fn) {
  let p;
  return (...args) => {
    if (p) {
      return p;
    }
    p = Promise.resolve(fn(...args));
    return p;
  };
}
class IPXError extends Error {
}
function createError(statusMessage, statusCode, trace) {
  const err = new IPXError(statusMessage + (trace ? ` (${trace})` : ""));
  err.statusMessage = "IPX: " + statusMessage;
  err.statusCode = statusCode;
  return err;
}

const createFilesystemSource = (options) => {
  const rootDir = resolve(options.dir);
  return async (id) => {
    const fsPath = resolve(join(rootDir, id));
    if (!isValidPath(fsPath) || !fsPath.startsWith(rootDir)) {
      throw createError("Forbidden path", 403, id);
    }
    let stats;
    try {
      stats = await promises.stat(fsPath);
    } catch (err) {
      if (err.code === "ENOENT") {
        throw createError("File not found", 404, fsPath);
      } else {
        throw createError("File access error " + err.code, 403, fsPath);
      }
    }
    if (!stats.isFile()) {
      throw createError("Path should be a file", 400, fsPath);
    }
    return {
      mtime: stats.mtime,
      maxAge: options.maxAge,
      getData: cachedPromise(() => promises.readFile(fsPath))
    };
  };
};
const isWindows = process.platform === "win32";
function isValidPath(fp) {
  if (isWindows) {
    fp = fp.slice(parse(fp).root.length);
  }
  if (/[<>:"|?*]/.test(fp)) {
    return false;
  }
  return true;
}

const HTTP_RE = /^https?:\/\//;
const createHTTPSource = (options) => {
  const httpsAgent = new https.Agent({ keepAlive: true });
  const httpAgent = new http.Agent({ keepAlive: true });
  let _domains = options.domains || [];
  if (typeof _domains === "string") {
    _domains = _domains.split(",").map((s) => s.trim());
  }
  const domains = _domains.map((d) => {
    if (!HTTP_RE.test(d)) {
      d = "http://" + d;
    }
    return new URL(d).hostname;
  }).filter(Boolean);
  return async (id, reqOptions) => {
    const hostname = new URL(id).hostname;
    if (!hostname) {
      throw createError("Hostname is missing", 403, id);
    }
    if (!reqOptions?.bypassDomain && !domains.find((domain) => hostname === domain)) {
      throw createError("Forbidden host", 403, hostname);
    }
    const response = await fetch(id, {
      agent: id.startsWith("https") ? httpsAgent : httpAgent,
      ...options.fetchOptions
    });
    if (!response.ok) {
      throw createError("Fetch error", response.status || 500, response.statusText);
    }
    let maxAge = options.maxAge;
    const _cacheControl = response.headers.get("cache-control");
    if (_cacheControl) {
      const m = _cacheControl.match(/max-age=(\d+)/);
      if (m && m[1]) {
        maxAge = parseInt(m[1]);
      }
    }
    let mtime;
    const _lastModified = response.headers.get("last-modified");
    if (_lastModified) {
      mtime = new Date(_lastModified);
    }
    return {
      mtime,
      maxAge,
      getData: cachedPromise(() => response.arrayBuffer().then((ab) => Buffer.from(ab)))
    };
  };
};

function VArg(arg) {
  return destr(arg);
}
function parseArgs(args, mappers) {
  const vargs = args.split("_");
  return mappers.map((v, i) => v(vargs[i]));
}
function getHandler(key) {
  return Handlers[key];
}
function applyHandler(ctx, pipe, handler, argsStr) {
  const args = handler.args ? parseArgs(argsStr, handler.args) : [];
  return handler.apply(ctx, pipe, ...args);
}
function clampDimensionsPreservingAspectRatio(sourceDimensions, desiredDimensions) {
  const desiredAspectRatio = desiredDimensions.width / desiredDimensions.height;
  let { width, height } = desiredDimensions;
  if (width > sourceDimensions.width) {
    width = sourceDimensions.width;
    height = Math.round(sourceDimensions.width / desiredAspectRatio);
  }
  if (height > sourceDimensions.height) {
    height = sourceDimensions.height;
    width = Math.round(sourceDimensions.height * desiredAspectRatio);
  }
  return { width, height };
}

const quality = {
  args: [VArg],
  order: -1,
  apply: (context, _pipe, quality2) => {
    context.quality = quality2;
  }
};
const fit = {
  args: [VArg],
  order: -1,
  apply: (context, _pipe, fit2) => {
    context.fit = fit2;
  }
};
const position = {
  args: [VArg],
  order: -1,
  apply: (context, _pipe, position2) => {
    context.position = position2;
  }
};
const HEX_RE = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;
const SHORTHEX_RE = /^([a-f\d])([a-f\d])([a-f\d])$/i;
const background = {
  args: [VArg],
  order: -1,
  apply: (context, _pipe, background2) => {
    background2 = String(background2);
    if (!background2.startsWith("#") && (HEX_RE.test(background2) || SHORTHEX_RE.test(background2))) {
      background2 = "#" + background2;
    }
    context.background = background2;
  }
};
const enlarge = {
  args: [],
  apply: (context) => {
    context.enlarge = true;
  }
};
const width = {
  args: [VArg],
  apply: (context, pipe, width2) => {
    return pipe.resize(width2, null, { withoutEnlargement: !context.enlarge });
  }
};
const height = {
  args: [VArg],
  apply: (context, pipe, height2) => {
    return pipe.resize(null, height2, { withoutEnlargement: !context.enlarge });
  }
};
const resize = {
  args: [VArg, VArg, VArg],
  apply: (context, pipe, size) => {
    let [width2, height2] = String(size).split("x").map((v) => Number(v));
    if (!width2) {
      return;
    }
    if (!height2) {
      height2 = width2;
    }
    if (!context.enlarge) {
      const clamped = clampDimensionsPreservingAspectRatio(context.meta, { width: width2, height: height2 });
      width2 = clamped.width;
      height2 = clamped.height;
    }
    return pipe.resize(width2, height2, {
      fit: context.fit,
      position: context.position,
      background: context.background
    });
  }
};
const trim = {
  args: [VArg],
  apply: (_context, pipe, threshold2) => {
    return pipe.trim(threshold2);
  }
};
const extend = {
  args: [VArg, VArg, VArg, VArg],
  apply: (context, pipe, top, right, bottom, left) => {
    return pipe.extend({
      top,
      left,
      bottom,
      right,
      background: context.background
    });
  }
};
const extract = {
  args: [VArg, VArg, VArg, VArg],
  apply: (context, pipe, top, right, bottom, left) => {
    return pipe.extend({
      top,
      left,
      bottom,
      right,
      background: context.background
    });
  }
};
const rotate = {
  args: [VArg],
  apply: (context, pipe, angel) => {
    return pipe.rotate(angel, {
      background: context.background
    });
  }
};
const flip = {
  args: [],
  apply: (_context, pipe) => {
    return pipe.flip();
  }
};
const flop = {
  args: [],
  apply: (_context, pipe) => {
    return pipe.flop();
  }
};
const sharpen = {
  args: [VArg, VArg, VArg],
  apply: (_context, pipe, sigma, flat, jagged) => {
    return pipe.sharpen(sigma, flat, jagged);
  }
};
const median = {
  args: [VArg, VArg, VArg],
  apply: (_context, pipe, size) => {
    return pipe.median(size);
  }
};
const blur = {
  args: [VArg, VArg, VArg],
  apply: (_context, pipe) => {
    return pipe.blur();
  }
};
const flatten = {
  args: [VArg, VArg, VArg],
  apply: (context, pipe) => {
    return pipe.flatten({
      background: context.background
    });
  }
};
const gamma = {
  args: [VArg, VArg, VArg],
  apply: (_context, pipe, gamma2, gammaOut) => {
    return pipe.gamma(gamma2, gammaOut);
  }
};
const negate = {
  args: [VArg, VArg, VArg],
  apply: (_context, pipe) => {
    return pipe.negate();
  }
};
const normalize = {
  args: [VArg, VArg, VArg],
  apply: (_context, pipe) => {
    return pipe.normalize();
  }
};
const threshold = {
  args: [VArg],
  apply: (_context, pipe, threshold2) => {
    return pipe.threshold(threshold2);
  }
};
const modulate = {
  args: [VArg],
  apply: (_context, pipe, brightness, saturation, hue) => {
    return pipe.modulate({
      brightness,
      saturation,
      hue
    });
  }
};
const tint = {
  args: [VArg],
  apply: (_context, pipe, rgb) => {
    return pipe.tint(rgb);
  }
};
const grayscale = {
  args: [VArg],
  apply: (_context, pipe) => {
    return pipe.grayscale();
  }
};
const crop = extract;
const q = quality;
const b = background;
const w = width;
const h = height;
const s = resize;
const pos = position;

const BluebirdPromise = require("bluebird");
const cacheManager = require("cache-manager");
function memoryCache(config) {
  return cacheManager.caching({
    store: "memory",
    ...config
  });
}
function redisCache(config) {
  if (config && Array.isArray(config.configure)) {
    const redis = require("redis");
    const client = redis.createClient({
      retry_strategy() {
      },
      ...config
    });
    BluebirdPromise.all(config.configure.map((options) => new BluebirdPromise((resolve, reject) => {
      client.CONFIG("SET", ...options, function(err, result) {
        if (err || result !== "OK") {
          reject(err);
        } else {
          resolve(result);
        }
      });
    }))).then(() => client.quit());
  }
  return cacheManager.caching({
    store: require("cache-manager-redis"),
    retry_strategy() {
    },
    ...config
  });
}
function memcachedCache(config) {
  return cacheManager.caching({
    store: require("cache-manager-memcached-store"),
    ...config
  });
}
function multiCache(config) {
  const stores = config.stores.map(makeCache);
  return cacheManager.multiCaching(stores);
}
const cacheBuilders = {
  memory: memoryCache,
  multi: multiCache,
  redis: redisCache,
  memcached: memcachedCache
};
function makeCache(config = { type: "memory" }) {
  const builder = cacheBuilders[config.type];
  if (!builder) {
    throw new Error("Unknown store type: " + config.type);
  }
  return builder(config);
}

const SUPPORTED_FORMATS = ["jpeg", "png", "webp", "avif", "tiff", "gif"];
function createIPX(userOptions) {
  const cache = getEnv("IPX_CACHE_ENABLED", false) && getEnv("IPX_CACHE_REDIS_HOST", null) ? {
    type: "redis",
    host: getEnv("IPX_CACHE_REDIS_HOST", null),
    ttl: 10 * 60,
    configure: [
      ["maxmemory", "200mb"],
      ["maxmemory-policy", "allkeys-lru"]
    ]
  } : null;
  const defaults = {
    dir: getEnv("IPX_DIR", "."),
    domains: getEnv("IPX_DOMAINS", []),
    alias: getEnv("IPX_ALIAS", {}),
    fetchOptions: getEnv("IPX_FETCH_OPTIONS", {}),
    maxAge: getEnv("IPX_MAX_AGE", 300),
    cache,
    sharp: {}
  };
  const options = defu(userOptions, defaults);
  options.alias = Object.fromEntries(Object.entries(options.alias).map((e) => [withLeadingSlash(e[0]), e[1]]));
  const ctx = {
    cache: void 0,
    sources: {}
  };
  if (options.dir) {
    ctx.sources.filesystem = createFilesystemSource({
      dir: options.dir,
      maxAge: options.maxAge
    });
  }
  if (options.domains) {
    ctx.sources.http = createHTTPSource({
      domains: options.domains,
      fetchOptions: options.fetchOptions,
      maxAge: options.maxAge
    });
  }
  if (options.cache) {
    ctx.cache = makeCache(options.cache);
  }
  return function ipx(id, modifiers = {}, reqOptions = {}) {
    if (!id) {
      throw createError("resource id is missing", 400);
    }
    id = hasProtocol(id) ? id : withLeadingSlash(id);
    for (const base in options.alias) {
      if (id.startsWith(base)) {
        id = joinURL(options.alias[base], id.substr(base.length));
      }
    }
    const getSrc = cachedPromise(() => {
      const source = hasProtocol(id) ? "http" : "filesystem";
      if (!ctx.sources[source]) {
        throw createError("Unknown source", 400, source);
      }
      return ctx.sources[source](id, reqOptions);
    });
    const getData = cachedPromise(async () => {
      let match;
      const cacheKey = JSON.stringify({ id, ...modifiers });
      if (getEnv("IPX_CACHE_ENABLED", false) && ctx.cache) {
        match = await ctx.cache.get(cacheKey);
        if (match) {
          const element = match.element;
          if (!(element instanceof Buffer)) {
            element.data = Buffer.from(element.data);
          }
          return element;
        }
      }
      const src = await getSrc();
      const data = await src.getData();
      const meta = imageMeta(data);
      const mFormat = modifiers.f || modifiers.format;
      let format = mFormat || meta.type;
      if (format === "jpg") {
        format = "jpeg";
      }
      if (meta.type === "svg" && !mFormat) {
        return {
          data,
          format: "svg+xml",
          meta
        };
      }
      const animated = modifiers.animated !== void 0 || modifiers.a !== void 0 || format === "gif";
      const Sharp = await import('sharp').then((r) => r.default || r);
      let sharp = Sharp(data, { animated });
      Object.assign(sharp.options, options.sharp);
      const handlers = Object.entries(modifiers).map(([name, args]) => ({
        handler: getHandler(name),
        name,
        args
      })).filter((h) => h.handler).sort((a, b) => {
        const aKey = (a.handler.order || a.name || "").toString();
        const bKey = (b.handler.order || b.name || "").toString();
        return aKey.localeCompare(bKey);
      });
      const handlerCtx = { meta };
      for (const h of handlers) {
        sharp = applyHandler(handlerCtx, sharp, h.handler, h.args) || sharp;
      }
      if (SUPPORTED_FORMATS.includes(format)) {
        sharp = sharp.toFormat(format, {
          quality: handlerCtx.quality,
          progressive: format === "jpeg"
        });
      }
      const newData = await sharp.toBuffer();
      const result = {
        data: newData,
        format,
        meta
      };
      if (getEnv("IPX_CACHE_ENABLED", false) && ctx.cache && !match) {
        const cacheEntry = {
          element: result,
          timestamp: new Date(),
          expiry: src.maxAge
        };
        await ctx.cache.set(cacheKey, cacheEntry, { ttl: void 0 });
      }
      return result;
    });
    return {
      src: getSrc,
      data: getData
    };
  };
}

const MODIFIER_SEP = /[,&]/g;
const MODIFIER_VAL_SEP = /[_=:]/g;
async function _handleRequest(req, ipx) {
  const res = {
    statusCode: 200,
    statusMessage: "",
    headers: {},
    body: ""
  };
  const [modifiersStr = "", ...idSegments] = req.url.substring(1).split("/");
  const id = safeString(decode(idSegments.join("/")));
  if (!modifiersStr) {
    throw createError("Modifiers are missing", 400, req.url);
  }
  if (!id || id === "/") {
    throw createError("Resource id is missing", 400, req.url);
  }
  const modifiers = /* @__PURE__ */ Object.create(null);
  if (modifiersStr !== "_") {
    for (const p of modifiersStr.split(MODIFIER_SEP)) {
      const [key, value = ""] = p.split(MODIFIER_VAL_SEP);
      modifiers[safeString(key)] = safeString(decode(value));
    }
  }
  const img = ipx(id, modifiers, req.options);
  const src = await img.src();
  if (src.mtime) {
    if (req.headers["if-modified-since"]) {
      if (new Date(req.headers["if-modified-since"]) >= src.mtime) {
        res.statusCode = 304;
        return res;
      }
    }
    res.headers["Last-Modified"] = +src.mtime + "";
  }
  if (typeof src.maxAge === "number") {
    res.headers["Cache-Control"] = `max-age=${+src.maxAge}, public, s-maxage=${+src.maxAge}`;
  }
  const { data, format } = await img.data();
  const etag = getEtag(data);
  res.headers.ETag = etag;
  if (etag && req.headers["if-none-match"] === etag) {
    res.statusCode = 304;
    return res;
  }
  if (format) {
    res.headers["Content-Type"] = `image/${format}`;
  }
  res.headers["Content-Security-Policy"] = "default-src 'none'";
  res.body = data;
  return sanetizeReponse(res);
}
function handleRequest(req, ipx) {
  return _handleRequest(req, ipx).catch((err) => {
    const statusCode = parseInt(err.statusCode) || 500;
    const statusMessage = err.statusMessage ? err.statusMessage : `IPX Error (${statusCode})`;
    if (process.env.NODE_ENV !== "production" && statusCode === 500) {
      console.error(err);
    }
    return sanetizeReponse({
      statusCode,
      statusMessage,
      body: "IPX Error: " + err,
      headers: {}
    });
  });
}
function createIPXMiddleware(ipx) {
  return function IPXMiddleware(req, res) {
    return handleRequest({ url: req.url, headers: req.headers }, ipx).then((_res) => {
      res.statusCode = _res.statusCode;
      res.statusMessage = _res.statusMessage;
      for (const name in _res.headers) {
        res.setHeader(name, _res.headers[name]);
      }
      res.end(_res.body);
    });
  };
}
function sanetizeReponse(res) {
  return {
    statusCode: res.statusCode || 200,
    statusMessage: res.statusMessage ? safeString(res.statusMessage) : "OK",
    headers: safeStringObject(res.headers || {}),
    body: typeof res.body === "string" ? xss(safeString(res.body)) : res.body || ""
  };
}
function safeString(input) {
  return JSON.stringify(input).replace(/^"|"$/g, "");
}
function safeStringObject(input) {
  const dst = {};
  for (const key in input) {
    dst[key] = safeString(input[key]);
  }
  return dst;
}

export { createIPXMiddleware as a, createIPX as c, handleRequest as h };
