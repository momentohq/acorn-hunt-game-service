import { getCacheClient, getTopicClient } from '../services/momento.js';

let cacheClient;
let topicClient;

const initialize = async () => {
  cacheClient = await getCacheClient();
  topicClient = await getTopicClient();
};

const subscribe = async (gameId) => {
  await topicClient.subscribe('chat', `${gameId}-chat`, {
    onItem: async (message) => { await cacheClient.listPushBack('chat', gameId, message.value()); },
    onError: (error) => console.error(error)
  });
  
}

export const Chat = {
  initialize,
  subscribe
};