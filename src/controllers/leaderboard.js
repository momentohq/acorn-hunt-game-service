import { CacheSortedSetPutElement, SortedSetOrder, CacheSortedSetFetch } from "@gomomento/sdk";
import { getCacheClient, getTopicClient } from "../services/momento.js";

const updateScore = async (gameId, username, points) => {
  const cacheClient = await getCacheClient(['leaderboard']);
  const topicClient = await getTopicClient();

  const newScore = await cacheClient.sortedSetIncrementScore('leaderboard', gameId, username, points);
  await topicClient.publish('leaderboard', 'points-updated', JSON.stringify({ gameId, username, score: newScore.score() }));
  return newScore.score();
};

const setScore = async (gameId, username, score) => {
  const cacheClient = await getCacheClient(['leaderboard']);
  const setScoreResponse = await cacheClient.sortedSetPutElement('leaderboard', gameId, username, score);
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

const fetch = async (gameId, order, top) => {
  const sortOrder = order?.toLowerCase() == 'asc' ? SortedSetOrder.Ascending : SortedSetOrder.Descending;
  const cacheClient = await getCacheClient(['leaderboard']);
  const leaderboardResponse = await cacheClient.sortedSetFetchByRank('leaderboard', gameId, {
    order: sortOrder,
    ...top && {
      startRank: 0,
      endRank: top
    }
  });

  if (leaderboardResponse instanceof CacheSortedSetFetch.Miss) {
    return { success: false, error: 'GameNotFound' };
  }

  const leaderboard = leaderboardResponse.valueArray().map((element, rank) => {
    return {
      rank: rank + 1,
      username: element.value,
      score: Math.floor(element.score)
    }
  });

  return { success: true, leaderboard };
};

export const Leaderboard = {
  updateScore,
  setScore,
  fetch
};