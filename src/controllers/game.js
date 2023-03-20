import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { CacheDictionaryFetch, CacheSortedSetGetScore, CacheSetFetch, CollectionTtl } from '@gomomento/sdk';
import { getCacheClient } from '../services/momento.js';
import UserSession from './user.js';

const eventBridge = new EventBridgeClient();

/**
 * Makes the caller a player in the provided game. If the caller is actively part of another game, 
 * it will remove them first.
 * 
 * @param { string } gameId - Unique identifier of the game
 * @param { string } username - Username of the player to add
 * @returns {{success: boolean, error: string}} - An object indicating if the operation was a success
 */
const join = async (gameId, username) => {
  const cacheClient = await getCacheClient(['game', 'player', 'user', 'connection']);
  //const topicClient = await getTopicClient();

  const gameResponse = await cacheClient.dictionaryFetch('game', gameId);
  if (gameResponse instanceof CacheDictionaryFetch.Miss) {
    return { success: false, error: 'GameNotFound' };
  }

  const userSession = await UserSession.load(username);

  if (userSession.gameId) {
    await leave(username, userSession.gameId, userSession);
  }

  const notification = {
    gameId: gameId,
    connectionId: userSession.connectionId,
    message: `${username} joined the chat`
  };

  await Promise.all([
    await cacheClient.setAddElement('player', gameId, username),
    await initializeLeaderboardScore(cacheClient, gameId, username),
    await cacheClient.setAddElement('connection', gameId, userSession.connectionId),
    await cacheClient.dictionarySetField('user', username, 'currentGameId', gameId),
    await broadcastMessage(cacheClient, gameId, { type: 'player-change', message: `${username} joined the chat`, time: new Date().toISOString() }, userSession.connectionId),
    //await topicClient.publish('game', 'player-change', JSON.stringify(notification))
  ]);

return { success: true };
};

/**
 * Removes the caller from a specific game
 * 
 * @param { string } gameId - Unique identifier of the game
 * @param { string } username - Username of the player to remove
 */
const leave = async (username, gameId, userSession) => {
  const cacheClient = await getCacheClient(['player', 'connection', 'user']);
  //const topicClient = await getTopicClient();

  if (!userSession) {
    userSession = await UserSession.load(username);
  }

  const notification = {
    gameId: gameId,
    connectionId: userSession.connectionId,
    message: `${username} left the chat`
  };

  await Promise.all([
    await cacheClient.setRemoveElement('player', gameId, username),
    await cacheClient.setRemoveElement('connection', gameId, userSession.connectionId),
    await cacheClient.dictionaryRemoveField('user', username, 'currentGameId', gameId),
    await broadcastMessage(cacheClient, gameId, { type: 'player-change', message: `${username.valueString()} left the chat`, time: new Date().toISOString() }, userSession.connectionId),
    //await topicClient.publish('game', 'player-change', JSON.stringify(notification))
  ]);
};

const initializeLeaderboardScore = async (momento, gameId, username) => {
  const existingScore = await momento.sortedSetGetScore('leaderboard', gameId, username);
  if (existingScore instanceof CacheSortedSetGetScore.Miss) {
    await momento.sortedSetPutElement('leaderboard', gameId, username, 0.3);
  }
};

const list = async () => {
  const cacheClient = await getCacheClient(['game']);

  let gameList = [];
  const games = await cacheClient.setFetch('game', 'list');
  if (games instanceof CacheSetFetch.Hit) {
    gameList = games.valueArray().map(g => JSON.parse(g));
  }

  return gameList;
};

/**
 * Creates a new game with the given criteria. Will fail if a game with the same name is provided
 * 
 * @param {*} name - Game name. This will be modified and used as the identifier
 * @param {*} duration - Length of time the game will be valid for
 * @param {*} mapId - Identifier of the map for the game
 * @param {*} isRanked - Indicates if this is a ranked match
 * @returns {{success: boolean, id: string, error: string}} - An object indicating if the operation was a success
 */
const create = async (name, duration, mapId, isRanked) => {
  const nameKey = name.toLowerCase().replace(/[^\w\s]/gi, '').replace(/ /g, '-');
  const gameList = await list();
  if (gameList.includes(nameKey)) {
    return { success: false, error: 'GameExists' };
  }

  const cacheClient = await getCacheClient(['game']);
  await Promise.all([
    await cacheClient.dictionarySetFields('game', nameKey, {
      duration: `${duration}`,
      name: name,
      ...mapId && { mapId: mapId },
      ...isRanked && { isRanked: `${isRanked}` }
    }, { ttl: CollectionTtl.of(duration) }),
    await cacheClient.setAddElement('game', 'list', JSON.stringify({ id: nameKey, name: name }))
  ]);

  return { success: true, id: nameKey };
};

const configure = async () => {
  const topicClient = await getTopicClient();
  topicClient.subscribe('game', 'player-change', {
    onItem: notifyPlayers,
    onError: logSubscriptionError
  });

  console.log('Topic client configured for player list updates');
};

const logSubscriptionError = (data, subscription) => {
  console.error(`An error occurred with the play list subscription: ${data.toString()}`);
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

export const Game = {
  join,
  leave,
  list,
  create
};