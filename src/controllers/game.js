import { CacheDictionaryFetch, CacheSortedSetGetScore, CacheSetFetch, CacheListFetch, CollectionTtl } from '@gomomento/sdk';
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
    message: `${username} joined the chat`,
    username: username
  };

  const game = gameResponse.valueRecord();
  const tileResponse = await cacheClient.dictionaryFetch('game', `${gameId}-tiles`);
  const tiles = Object.keys(tileResponse.valueRecord());
  const map = Maps[game.map];
  let coords, x, y;
  while (!coords) {
    x = Math.floor(Math.random() * map.width);
    y = Math.floor(Math.random() * map.height);
    coords = `${x},${y}`;
    if (tiles.includes(coords)) {
      coords = '';
    }
  }

  const avatar = 'blue-squirrel';

  const userTile = {
    type: 'player',
    avatar,
    username,
    direction: x < (map.width / 2) ? 'right' : 'left'
  };

  const results = await Promise.allSettled([
    await cacheClient.setAddElement('player', gameId, username),
    await initializeLeaderboardScore(cacheClient, gameId, username),
    await cacheClient.setAddElement('connection', gameId, userSession.connectionId),
    await cacheClient.dictionarySetFields('user', username, { x, y, avatar, currentGameId: gameId }),
    await cacheClient.dictionarySetField('game', `${gameId}-tiles`, coords, JSON.stringify(userTile)),
    await topicClient.publish('game', 'player-joined', JSON.stringify(notification)),
    await topicClient.publish('game', 'player-moved', JSON.stringify({ ...userTile, x, y, gameId }))
  ]);

  const failedCalls = results.filter(result => result.status == 'rejected');
  for (const failedCall of failedCalls) {
    console.error({ error: 'JoinGameFailed', message: `${failedCall.reason} - ${failedCall.value}` });
  }

  const messages = await cacheClient.listFetch('chat', gameId);
  const players = await cacheClient.setFetch('player', gameId);

  const response = {
    name: game.name,
    username: username,
    players: Array.from(players.valueSet()),
    messages: []
  }

  if (messages instanceof CacheListFetch.Hit) {
    response.messages = messages.valueListString().map(m => JSON.parse(m));
  }

  return { success: true, response };
};

/**
 * Removes the caller from a specific game
 * 
 * @param { string } gameId - Unique identifier of the game
 * @param { string } username - Username of the player to remove
 */
const leave = async (gameId, username, userSession) => {
  const cacheClient = await getCacheClient(['player', 'connection', 'user']);
  const topicClient = await getTopicClient();

  if (!userSession) {
    userSession = await UserSession.load(username);
  }

  const notification = {
    gameId: gameId,
    message: `${username} left the chat`,
    username: username
  };

  const userLocationResponse = await cacheClient.dictionaryGetFields('user', username, ['x', 'y']);
  const location = userLocationResponse.valueRecord();

  const results = await Promise.allSettled([
    await cacheClient.setRemoveElement('player', gameId, username),
    await cacheClient.setRemoveElement('connection', gameId, userSession.connectionId),
    await cacheClient.dictionaryRemoveFields('user', username, ['currentGameId', 'x', 'y', 'avatar']),
    await cacheClient.dictionaryRemoveField('game', `${gameId}-tiles`, `${location.x},${location.y}`),
    await topicClient.publish('game', 'player-left', JSON.stringify(notification))
  ]);

  const failedCalls = results.filter(result => result.status == 'rejected');
  for (const failedCall of failedCalls) {
    console.error({ error: 'LeaveGameFailed', message: `${failedCall.reason} - ${failedCall.value}` });
  }
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
  mapId = 'oakCity';
  const map = Maps[mapId];

  const blocks = {}
  map.blocks.map(block => {
    blocks[`${block.x},${block.y}`] = JSON.stringify({ type: block.type });
  });

  await Promise.all([
    await cacheClient.dictionarySetFields('game', nameKey, {
      duration: `${duration}`,
      name: name,
      map: mapId,
      ...isRanked && { isRanked: `${isRanked}` }
    }, { ttl: CollectionTtl.of(duration) }),
    await cacheClient.setAddElement('game', 'list', JSON.stringify({ id: nameKey, name: name })),
    await cacheClient.dictionarySetFields('game', `${gameId}-tiles`, blocks)
  ]);

  return { success: true, id: nameKey };
};

/**
 * Moves a character in the provided game if allowed
 * 
 * @param {string} gameId - Identifier of the game
 * @param {string} username - Username of the player to move
 * @param {string} direction - Direction to move the player. Valid values "up", "down", "left", "right"
 * @returns {object} New user coordinates and facing direction
 */
const move = async (gameId, username, direction) => {
  const cacheClient = await getCacheClient(['user', 'game']);
  const topicClient = await getTopicClient();

  const game = await cacheClient.dictionaryGetField('game', gameId, 'map');
  const mapName = game.valueString();
  const map = Maps[mapName];
  const userLocationResponse = await cacheClient.dictionaryGetFields('user', username, ['x', 'y', 'avatar']);
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

  const playerSpace = {
    type: 'player',
    avatar: location.avatar,
    username,
    direction
  };

  const newSpace = await cacheClient.dictionaryGetField('game', `${gameId}-tiles`, `${x},${y}`);
  if (newSpace instanceof CacheDictionaryGetField.Miss) {
    await Promise.allSettled([
      await cacheClient.dictionaryRemoveField('game', `${gameId}-tiles`, `${location.x},${location.y}`),
      await cacheClient.dictionarySetField('game', `${gameId}-tiles`, `${x},${y}`, JSON.stringify(playerSpace))
    ]);
  }

  await topicClient.publish('game', 'player-moved', JSON.stringify({ ...playerSpace, x, y, gameId }));

  return { x, y, direction};
};

export const Game = {
  join,
  leave,
  list,
  create,
  move
};