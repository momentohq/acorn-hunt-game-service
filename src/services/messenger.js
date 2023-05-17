import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { CacheSetFetch } from '@gomomento/sdk';
import { getCacheClient, getTopicClient } from '../services/momento.js';

const eventBridge = new EventBridgeClient();

const configure = async () => {
  const topicClient = await getTopicClient();
  await topicClient.subscribe('game', 'player-joined', {
    onItem: onPlayerJoined,
    onError: logSubscriptionError
  });

  await topicClient.subscribe('game', 'player-left', {
    onItem: onPlayerLeft,
    onError: logSubscriptionError
  });

  await topicClient.subscribe('leaderboard', 'points-updated', {
    onItem: onPointsChanged,
    onError: logSubscriptionError
  });

  await topicClient.subscribe('game', 'player-moved', {
    onItem: onPlayerMoved,
    onError: logSubscriptionError
  });

  console.log('Topic client configured');
};

const logSubscriptionError = (data, subscription) => {
  console.error(`An error occurred with the a subscription: ${data.toString()}`);
};

const onPlayerJoined = async (data) => {
  const details = JSON.parse(data.value());

  const message = {
    type: 'player-joined', 
    message: details.message,
    username: details.username,
    time: new Date().toISOString()
  };

  await broadcastMessage(details.gameId, message, details.connectionId, true);
};

const onPlayerLeft = async (data) => {
  const details = JSON.parse(data.value());

  const message = {
    type: 'player-left', 
    message: details.message,
    username: details.username,
    time: new Date().toISOString()
  };

  await broadcastMessage(details.gameId, message, undefined, true);
};

const onPointsChanged = async (data) => {
  const details = JSON.parse(data.value());

  const message = {
    type: 'points-updated',
    username: details.username,
    score: details.score,
    time: new Date().toISOString()
  };

  await broadcastMessage(details.gameId, message, undefined, false);
};

const onPlayerMoved = async (data) => {
  const details = JSON.parse(data.value());

  const message = {
    type: 'player-moved',
    username: details.username,
    avatar: details.avatar,
    direction: details.direction,
    x: Number(details.x),
    y: Number(details.y)
  };

  await broadcastMessage(details.gameId, message, undefined, false);
};

const broadcastMessage = async (gameId, message, connectionIdToIgnore, saveToChatHistory) => {
  const cacheClient = await getCacheClient();
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
            saveToChatHistory: saveToChatHistory,
          })
        }
      ]
    }));
  }
};

export const Messenger = {
  configure
};