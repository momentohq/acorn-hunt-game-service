import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { CacheSetFetch } from '@gomomento/sdk';
import { getCacheClient, getTopicClient } from '../services/momento.js';

const eventBridge = new EventBridgeClient();

const configure = async () => {
  const topicClient = await getTopicClient();
  topicClient.subscribe('game', 'player-joined', {
    onItem: onPlayerJoined,
    onError: logSubscriptionError
  });

  topicClient.subscribe('game', 'player-left', {
    onItem: onPlayerLeft,
    onError: logSubscriptionError
  });

  topicClient.subscribe('leaderboard', 'points-updated', {
    onItem: onPointsChanged,
    onError: logSubscriptionError
  });

  console.log('Topic client configured');
};

const logSubscriptionError = (data, subscription) => {
  console.error(`An error occurred with the a subscription: ${data.toString()}`);
};

const onPlayerJoined = async (data) => {
  const details = JSON.parse(data);

  const message = {
    type: 'player-joined', 
    message: details.message,
    username: details.username,
    time: new Date().toISOString()
  };

  await broadcastMessage(details.gameId, message, details.connectionId);
};

const onPlayerLeft = async (data) => {
  const details = JSON.parse(data);

  const message = {
    type: 'player-left', 
    message: details.message,
    username: details.username,
    time: new Date().toISOString()
  };

  await broadcastMessage(details.gameId, message, details.connectionId);
};

const onPointsChanged = async (data) => {
  const details = JSON.parse(data);

  const message = {
    type: 'points-updated',
    username: details.username,
    score: details.score,
    time: new Date().toISOString()
  };

  await broadcastMessage(details.gameId, message);
};

const broadcastMessage = async (gameId, message, connectionIdToIgnore) => {
  const cacheClient = await getCacheClient(['connection']);
  const connectionResponse = await cacheClient.setFetch('connection', gameId);
  if (connectionResponse instanceof CacheSetFetch.Hit) {
    let connections = connectionResponse.valueArray();
    if(connectionIdToIgnore){
      connections = connections.filter(connection => connection != connectionIdToIgnore);
    }
    
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