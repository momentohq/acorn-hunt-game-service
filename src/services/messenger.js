import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { CacheSetFetch } from '@gomomento/sdk';
import { getCacheClient } from '../services/momento.js';

const eventBridge = new EventBridgeClient();

const configure = async () => {
  const topicClient = await getTopicClient();
  topicClient.subscribe('game', 'player-change', {
    onItem: notifyPlayers,
    onError: logSubscriptionError
  });
};

const logSubscriptionError = (data, subscription) => {
  console.error(`An error occurred with the a subscription: ${data.toString()}`);
};

const notifyPlayers = async (data) => {
  const cacheClient = await getCacheClient(['connection']);
  const details = JSON.parse(data);

  const message = {
    type: 'player-change', 
    message: details.message,
    time: new Date().toISOString()
  };

  await broadcastMessage(cacheClient, details.gameId, message, details.connectionId);
};

const broadcastMessage = async (cacheClient, gameId, message, connectionIdToIgnore) => {
  const connectionResponse = await cacheClient.setFetch('connection', gameId);
  if (connectionResponse instanceof CacheSetFetch.Hit) {
    const connections = connectionResponse.valueArray().filter(connection => connection != connectionIdToIgnore);
    await eventBridge.send(new PutEventsCommand({
      Entries: [
        {
          DetailType: 'Post to Connections',
          Source: 'acorn-hunt',
          Detail: JSON.stringify({
            connections,
            message,
            gameId,
            saveToChatHistory: true,
          })
        }
      ]
    }));
  }
};

export const Messenger = {
  configure
};