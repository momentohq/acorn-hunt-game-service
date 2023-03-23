import { CacheDictionaryFetch, CacheSortedSetGetScore, CacheSetFetch, CollectionTtl } from '@gomomento/sdk';
import { getCacheClient, getTopicClient } from '../services/momento.js';
import UserSession from './user.js';
import { Maps } from '../services/maps.js';

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
  const topicClient = await getTopicClient();

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
    message: `${username} joined the chat`,
    username: username
  };

  await Promise.allSettled([
    await cacheClient.setAddElement('player', gameId, username),
    await initializeLeaderboardScore(cacheClient, gameId, username),
    await cacheClient.setAddElement('connection', gameId, userSession.connectionId),
    await cacheClient.dictionarySetField('user', username, 'currentGameId', gameId),
    await topicClient.publish('game', 'player-joined', JSON.stringify(notification))
  ]);

  const messages = await cacheClient.listFetch('chat', gameId);
  const players = await cacheClient.setFetch('player', gameId);

  const response = {
    name: gameResponse.valueRecord().name,
    username: username,
    players: Array.from(players.valueSet()),
    messages: messages.valueListString().map(m => JSON.parse(m))
  }

  return { success: true, response };
};

/**
 * Removes the caller from a specific game
 * 
 * @param { string } gameId - Unique identifier of the game
 * @param { string } username - Username of the player to remove
 */
const leave = async (username, gameId, userSession) => {
  const cacheClient = await getCacheClient(['player', 'connection', 'user']);
  const topicClient = await getTopicClient();

  if (!userSession) {
    userSession = await UserSession.load(username);
  }

  const notification = {
    gameId: gameId,
    connectionId: userSession.connectionId,
    message: `${username} left the chat`,
    username: username
  };

  await Promise.all([
    await cacheClient.setRemoveElement('player', gameId, username),
    await cacheClient.setRemoveElement('connection', gameId, userSession.connectionId),
    await cacheClient.dictionaryRemoveField('user', username, 'currentGameId', gameId),
    await topicClient.publish('game', 'player-left', JSON.stringify(notification))
  ]);
};

const initializeLeaderboardScore = async (cacheClient, gameId, username) => {
  const existingScore = await cacheClient.sortedSetGetScore('leaderboard', gameId, username);
  if (existingScore instanceof CacheSortedSetGetScore.Miss) {
    await cacheClient.sortedSetPutElement('leaderboard', gameId, username, 0.3);
  }
};

/**
 * Get a list of all active games
 * 
 * @returns array of game objects containing the name and identifier
 */
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
      map: 'oakCity',
      ...isRanked && { isRanked: `${isRanked}` }
    }, { ttl: CollectionTtl.of(duration) }),
    await cacheClient.setAddElement('game', 'list', JSON.stringify({ id: nameKey, name: name }))
  ]);

  return { success: true, id: nameKey };
};

const move = async (gameId, username, direction) => {
  const cacheClient = await getCacheClient(['user', 'game']);

  const game = await cacheClient.dictionaryGetField('game', gameId, 'map');
  const mapName = game.valueString();
  const map = Maps[mapName];
  const userLocationResponse = await cacheClient.dictionaryGetFields('user', username, ['x', 'y']);
  const location = userLocationResponse.valueRecord();
  let x = Number(location.x);
  let y = Number(location.y);

  switch (direction.toLowerCase()) {
    case 'up':
      if (y > 0) {
        y -= 1;
      }
      break;
    case 'down':
      if (y < (map.height - 1)) {
        y += 1
      }
      break;
    case 'left':
      if (x > 0) {
        x -= 1;
      }
      break;
    case 'right':
      if (x < (map.width - 1)) {
        x += 1;
      }
      break;
  }

  const newSpace = await cacheClient.dictionaryGetField('game', `${gameId}-tiles`, `${x},${y}`);
  if (newSpace instanceof CacheDictionaryGetField.Miss) {

  }
};

export const Game = {
  join,
  leave,
  list,
  create
};