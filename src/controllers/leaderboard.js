import { CacheSortedSetPutElement } from "@gomomento/sdk";
import { getCacheClient, getTopicClient } from "../services/momento.js";

const updateScore = async (gameId, username, points) => {
  const cacheClient = await getCacheClient(['leaderboard']);
  const topicClient = await getTopicClient();

  const newScore = await cacheClient.sortedSetIncrementScore('leaderboard', gameId, username, points);
  await topicClient.publish('leaderboard', 'points-updated', JSON.stringify({ gameId, username, score: newScore.score() }));
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
};