import defu from 'defu'
import { imageMeta } from 'image-meta'
import { hasProtocol, joinURL, withLeadingSlash } from 'ufo'
import type { Cache } from 'cache-manager'
import type { Source, SourceData } from './types'
import { createFilesystemSource, createHTTPSource } from './sources'
import { applyHandler, getHandler } from './handlers'
import { cachedPromise, getEnv, createError } from './utils'
import makeCache from './cache-builders'

// TODO: Move to image-meta
export interface ImageMeta {
  width: number
  height: number
  type: string
  mimeType: string
}

export interface IPXCTX {
  sources: Record<string, Source>
  cache: Cache
}

export interface IPXImageData {
  src: () => Promise<SourceData>,
  data: () => Promise<{
    data: Buffer,
    meta: ImageMeta,
    format: string
  }>
}

export type IPX = (id: string, modifiers?: Record<string, string>, reqOptions?: any) => IPXImageData

export interface IPXOptions {
  dir?: false | string
  maxAge?: number
  domains?: false | string[]
  alias: Record<string, string>,
  fetchOptions: RequestInit,
  // TODO: Create types
  // https://github.com/lovell/sharp/blob/master/lib/constructor.js#L130
  sharp?: { [key: string]: any }
  cache?: { [key: string]: any }
}

// https://sharp.pixelplumbing.com/#formats
// (gif and svg are not supported as output)
const SUPPORTED_FORMATS = ['jpeg', 'png', 'webp', 'avif', 'tiff', 'gif']

export function createIPX (userOptions: Partial<IPXOptions>): IPX {
  const cache = getEnv('IPX_CACHE_REDIS_HOST', null)
    ? {
        type: 'redis',
        host: getEnv('IPX_CACHE_REDIS_HOST', null),
        ttl: 10 * 60,
        configure: [
          ['maxmemory', '200mb'],
          ['maxmemory-policy', 'allkeys-lru']
        ]
      }
    : null

  const defaults = {
    dir: getEnv('IPX_DIR', '.'),
    domains: getEnv('IPX_DOMAINS', []),
    alias: getEnv('IPX_ALIAS', {}),
    fetchOptions: getEnv('IPX_FETCH_OPTIONS', {}),
    maxAge: getEnv('IPX_MAX_AGE', 300),
    cache,
    sharp: {}
  }
  const options: IPXOptions = defu(userOptions, defaults) as IPXOptions

  // Normalize alias to start with leading slash
  options.alias = Object.fromEntries(Object.entries(options.alias).map(e => [withLeadingSlash(e[0]), e[1]]))

  const ctx: IPXCTX = {
    cache: undefined,
    sources: {}
  }

  // Init sources
  if (options.dir) {
    ctx.sources.filesystem = createFilesystemSource({
      dir: options.dir,
      maxAge: options.maxAge
    })
  }
  if (options.domains) {
    ctx.sources.http = createHTTPSource({
      domains: options.domains,
      fetchOptions: options.fetchOptions,
      maxAge: options.maxAge
    })
  }

  if (options.cache) {
    ctx.cache = makeCache(options.cache)
  }

  return function ipx (id, modifiers = {}, reqOptions = {}) {
    if (!id) {
      throw createError('resource id is missing', 400)
    }

    // Enforce leading slash
    id = hasProtocol(id) ? id : withLeadingSlash(id)

    // Resolve alias
    for (const base in options.alias) {
      if (id.startsWith(base)) {
        id = joinURL(options.alias[base], id.substr(base.length))
      }
    }

    const getSrc = cachedPromise(() => {
      const source = hasProtocol(id) ? 'http' : 'filesystem'
      if (!ctx.sources[source]) {
        throw createError('Unknown source', 400, source)
      }
      return ctx.sources[source](id, reqOptions)
    })

    const getData = cachedPromise(async () => {
      let match: any
      if (getEnv('IPX_CACHE_ENABLED', false) && ctx.cache) {
        match = await ctx.cache.get(id)
        if (match) {
          return match.element
        }
      }

      const src = await getSrc()
      const data = await src.getData()

      // Extract source meta
      const meta = imageMeta(data) as ImageMeta

      // Determine format
      const mFormat = modifiers.f || modifiers.format
      let format = mFormat || meta.type
      if (format === 'jpg') {
        format = 'jpeg'
      }
      // Use original svg if format not specified
      if (meta.type === 'svg' && !mFormat) {
        return {
          data,
          format: 'svg+xml',
          meta
        }
      }

      // Experimental animated support
      // https://github.com/lovell/sharp/issues/2275
      const animated = modifiers.animated !== undefined || modifiers.a !== undefined || format === 'gif'

      const Sharp = await import('sharp').then(r => r.default || r) as typeof import('sharp')
      let sharp = Sharp(data, { animated })
      Object.assign((sharp as any).options, options.sharp)

      // Resolve modifiers to handlers and sort
      const handlers = Object.entries(modifiers)
        .map(([name, args]) => ({
          handler: getHandler(name),
          name,
          args
        }))
        .filter(h => h.handler)
        .sort((a, b) => {
          const aKey = ((a.handler.order || a.name || '')).toString()
          const bKey = ((b.handler.order || b.name || '')).toString()
          return aKey.localeCompare(bKey)
        })

      // Apply handlers
      const handlerCtx: any = { meta }
      for (const h of handlers) {
        sharp = applyHandler(handlerCtx, sharp, h.handler, h.args) || sharp
      }

      // Apply format
      if (SUPPORTED_FORMATS.includes(format)) {
        sharp = sharp.toFormat(format as any, {
          quality: handlerCtx.quality,
          progressive: format === 'jpeg'
        })
      }

      // Convert to buffer
      const newData = await sharp.toBuffer()

      const result = {
        data: newData,
        format,
        meta
      }

      if (getEnv('IPX_CACHE_ENABLED', false) && ctx.cache && !match) {
        // Store to cache
        const cacheEntry = {
          element: result,
          timestamp: new Date(),
          expiry: src.maxAge
        }
        await ctx.cache.set(id, cacheEntry, { ttl: undefined })
      }

      return result
    })

    return {
      src: getSrc,
      data: getData
    }
  }
}
