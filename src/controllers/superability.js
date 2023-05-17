import { Leaderboard } from "./leaderboard.js";
import { getCacheClient } from "../services/momento.js";

const MAX_SUPER_ABILITIES = 5;

/**
 * Increase the amount of super ability uses a player has in their current game. 
 * Will not increase the amount over the maximum allowed value (5);
 * 
 * @param {string} gameId - Identifier for the game
 * @param {string} username - Player username
 * @param {integer} count - Number to increase by
 * @returns {integer} - The new amount of super ability uses
 */
const increase = async (gameId, username, count) => {
  const cacheClient = await getCacheClient();

  const incrementResponse = await cacheClient.increment('player', `${gameId}-${username}-SA`, count);
  let remaining = incrementResponse.value;
  if (incrementResponse.value > MAX_SUPER_ABILITIES) {
    await cacheClient.set('player', `${gameId}-${username}-SA`, `${MAX_SUPER_ABILITIES}`);
    count = count - (incrementResponse.value - MAX_SUPER_ABILITIES);
    remaining = MAX_SUPER_ABILITIES;
  }

  if (count > 0) {
    await Leaderboard.updateScore(gameId, username, Number(`.${count}`));
  }

  return remaining;
};

/**
 * Decreases the amount of super ability uses a player has in their current game.
 * Will not decrease below 0.
 * 
 * @param {string} gameId 
 * @param {string} username 
 * @returns {{success: boolean, remaining: integer}} - An object indicating if the operation was successful and the number of remaining uses 
 */
const decrease = async (gameId, username) => {
  const cacheClient = await getCacheClient();

  const decreaseResponse = await cacheClient.increment('player', `${gameId}-${username}-SA`, -1);
  if (decreaseResponse.value < 0) {
    return { success: false };
  }

  await Leaderboard.updateScore(gameId, username, -.1);
  return { success: true, remaining: decreaseResponse.value };
};

export const SuperAbility = {
  increase,
  decrease
};