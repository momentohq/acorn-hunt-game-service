
import { CacheClient, EnvMomentoTokenProvider, Configurations } from '@gomomento/sdk';
import getSecret from './secrets.js';

let momento;
const initializedCaches = [];

export async function getCacheClient(caches) {
  if (!momento) {
    const authToken = await getSecret('momento');
    process.env.AUTH_TOKEN = authToken;
    const credentials = new EnvMomentoTokenProvider({ environmentVariableName: 'AUTH_TOKEN' });

    const cacheClient = new CacheClient({
      configuration: Configurations.Laptop.latest(),
      credentialProvider: credentials,
      defaultTtlSeconds: Number(process.env.CACHE_TTL)
    });
    momento = cacheClient;
  }

  await initializeCaches(caches);

  return momento;
};

const initializeCaches = async (caches) => {
  const uninitializedCaches = caches.filter(c => !initializedCaches.some(ic => ic == c));
  if (uninitializedCaches?.length) {
    const listCachesResponse = await momento.listCaches();
    const cachesToAdd = uninitializedCaches.filter(c => !listCachesResponse.caches.some(cache => cache.name == c));
    for (const cacheToAdd of cachesToAdd) {
      await momento.createCache(cacheToAdd)
    }
  }
};