import type { Cache } from 'cache-manager'

const BluebirdPromise = require('bluebird')
const cacheManager = require('cache-manager')

function memoryCache (config) {
  return cacheManager.caching({
    store: 'memory',
    ...config
  })
}

function redisCache (config) {
  if (config && Array.isArray(config.configure)) {
    const redis = require('redis')
    const client = redis.createClient({
      retry_strategy () {
      },
      ...config
    })

    BluebirdPromise.all(config.configure.map(options => new BluebirdPromise((resolve, reject) => {
      client.CONFIG('SET', ...options, function (err, result) {
        if (err || result !== 'OK') {
          reject(err)
        } else {
          resolve(result)
        }
      })
    })))
      .then(() => client.quit())
  }

  return cacheManager.caching({
    store: require('cache-manager-redis'),
    retry_strategy () {
    },
    ...config
  })
}

function memcachedCache (config) {
  return cacheManager.caching({
    store: require('cache-manager-memcached-store'),
    ...config
  })
}

function multiCache (config) {
  const stores = config.stores.map(makeCache)
  return cacheManager.multiCaching(stores)
}

const cacheBuilders = {
  memory: memoryCache,
  multi: multiCache,
  redis: redisCache,
  memcached: memcachedCache
}

export default function makeCache (config: any = { type: 'memory' }): Cache {
  const builder = cacheBuilders[config.type]
  if (!builder) {
    throw new Error('Unknown store type: ' + config.type)
  }

  return (builder(config))
}
