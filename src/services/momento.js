
import { CacheClient, Configurations, CredentialProvider } from '@gomomento/sdk';
import getSecret from './secrets.js';

let topicClient;
let momento;
const initializedCaches = [];

export async function getCacheClient(caches) {
  if (!momento) {
    const authToken = await getSecret('momento');

    const cacheClient = new CacheClient({
      configuration: Configurations.Laptop.latest(),
      credentialProvider: CredentialProvider.fromString(authToken),
      defaultTtlSeconds: Number(process.env.CACHE_TTL)
    });
    momento = cacheClient;
  }

  await initializeCaches(caches);

  return momento;
};

// export async function getTopicClient() {
//   if(topicClient)
//     return topicClient;

//   const authToken = await getSecret('momento');
//   topicClient = new TopicClient({
//     configuration: Configurations.Laptop.latest(),
//     credentialProvider: CredentialProvider.fromString(authToken),
//     defaultTtlSeconds: Number(process.env.CACHE_TTL)
//   });  
// };

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