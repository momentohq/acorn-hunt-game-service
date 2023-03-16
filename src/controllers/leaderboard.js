import { CacheSortedSetPutElement } from "@gomomento/sdk";
import { getCacheClient } from "../services/momento.js";

const updateScore = async (gameId, username, points) => {
  const momento = await getCacheClient(['leaderboard']);
  const newScore = await momento.sortedSetIncrementScore('leaderboard', gameId, username, points);

  return newScore.score();
};

const setScore = async (gameId, username, score) => {
  const momento = await getCacheClient(['leaderboard']);
  const setScoreResponse = await momento.sortedSetPutElement('leaderboard', gameId, username, score);
  if (setScoreResponse instanceof CacheSortedSetPutElement.Error) {
    console.error({
      error: 'SortedSetPutElement',
      data: {
        cache: 'leaderboard',
        key: gameId
      }
    });
  }
};

export const Leaderboard = {
  updateScore,
  setScore
}