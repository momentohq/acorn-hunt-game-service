
import { CacheClient, TopicClient, EnvMomentoTokenProvider, Configurations, CredentialProvider } from '@gomomento/sdk';
import getSecret from './secrets.js';

let topicClient;
let momento;
const initializedCaches = [];

/**
 * Gets an initialized Momento Cache Client
 * 
 * @param {string[]} caches - array of cache names to initialize
 * @returns @type CacheClient
 */
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

/**
 * Gets an initialized Momento Topic Client
 * 
 * @returns @type TopicClient
 */
export async function getTopicClient() {
  if(topicClient)
    return topicClient;

  const authToken = await getSecret('momento');
  topicClient = new TopicClient({
    configuration: Configurations.Laptop.v1(),
    credentialProvider: CredentialProvider.fromString()
  });

  return topicClient;  
}

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