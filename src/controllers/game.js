import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { CacheDictionaryFetch, CacheSortedSetGetScore, CacheSetFetch } from '@gomomento/sdk';
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
  const momento = await getCacheClient(['game', 'player', 'user', 'connection']);

  const gameResponse = await momento.dictionaryFetch('game', gameId);
  if (gameResponse instanceof CacheDictionaryFetch.Miss) {
    return { success: false, error: 'GameNotFound' };
  }

  const userSession = UserSession.load(username);

  if (userSession.gameId) {
    await leave(username, userSession.gameId, userSession);
  }

  await Promise.all([
    await momento.setAddElement('player', gameId, username),
    await initializeLeaderboardScore(momento, gameId, username),
    await momento.setAddElement('connection', gameId, userSession.connectionId),
    await momento.dictionarySetField('user', username, 'currentGameId', gameId),
    await broadcastMessage(momento, gameId, userSession.connectionId, { type: 'player-change', message: `${username} joined the chat`, time: new Date().toISOString() })
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
  const momento = await getCacheClient(['player', 'connection', 'user']);
  if (!userSession) {
    userSession = UserSession.load(username);
  }

  await Promise.all([
    await momento.setRemoveElement('player', gameId, username),
    await momento.setRemoveElement('connection', gameId, userSession.connectionId),
    await momento.dictionaryRemoveField('user', username, 'currentGameId', gameId),
    await broadcastMessage(momento, gameId, userSession.connectionId, { type: 'player-change', message: `${username.valueString()} left the chat`, time: new Date().toISOString() })
  ]);
};

const initializeLeaderboardScore = async (momento, gameId, username) => {
  const existingScore = await momento.sortedSetGetScore('leaderboard', gameId, username);
  if (existingScore instanceof CacheSortedSetGetScore.Miss) {
    await momento.sortedSetPutElement('leaderboard', gameId, username, 0.3);
  }
};

const broadcastMessage = async (momento, gameId, connectionIdToIgnore, message) => {
  const connectionResponse = await momento.setFetch('connection', gameId);
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

const list = async () => {
  const momento = await getCacheClient(['game']);

  let gameList = [];
  const games = await momento.setFetch('game', 'list');
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

  const momento = await getCacheClient(['game']);
  await Promise.all([
    await momento.dictionarySetFields('game', nameKey, {
      duration: `${duration}`,
      name: name,
      ...mapId && { mapId: mapId },
      ...isRanked && { isRanked: `${isRanked}` }
    }, { ttl: CollectionTtl.of(duration) }),
    await momento.setAddElement('game', 'list', JSON.stringify({ id: nameKey, name: name }))
  ]);

  return { success: true, id: nameKey };
};

const configure = async () => {
  
}

//const notifyPlayers = async( message )

export const Game = {
  join,
  leave,
  list,
  create
};