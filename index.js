import express from 'express';
import cors from 'cors';
import { authenticate, validateHasActiveGame } from './src/controllers/auth.js';
import { Leaderboard } from './src/controllers/leaderboard.js';
import { SuperAbility } from './src/controllers/superability.js';
import { Game } from './src/controllers/game.js';
import { Messenger } from './src/services/messenger.js';

const app = express();
app.use(express.json());
app.use(cors());

await Messenger.configure();

app.listen(8000, () => { console.log('listening on port 8000') });

app.post('/points', authenticate, validateHasActiveGame, async (req, res) => {
  try {
    const score = await Leaderboard.updateScore(req.user.gameId, req.user.username, req.body.points);

    return res.status(200).send({ score });
  } catch (err) {
    console.error('POST /points\n', err);
    return res.status(500).send({ message: 'Something went wrong' });
  }
});

app.post('/super-abilities', authenticate, validateHasActiveGame, async (req, res) => {
  try {
    const newCount = await SuperAbility.increase(req.user.gameId, req.user.username, req.body.count);
    return res.status(200).send({ remaining: newCount });
  } catch (err) {
    console.error('POST /super-abilities\n', err);
    return res.status(500).send({ message: 'Something went wrong' });
  }
});

app.delete('/super-abilities', authenticate, validateHasActiveGame, async (req, res) => {
  try {
    const response = await SuperAbility.decrease(req.user.gameId, req.user.username);
    if (response.success) {
      return res.status(200).send({ remaining: response.remaining });
    } else {
      res.status(409).send({ message: 'Out of super-ability uses' });
    }
  } catch (err) {
    console.error('DELETE /super-abilities\n', err);
    return res.status(500).send({ message: 'Something went wrong' });
  }
});

app.post('/movements', authenticate, validateHasActiveGame, async (req, res) => {
  try {
    console.log(req.body);
    console.log(req.body.direction);
    if (!["left", "right", "up", "down"].includes(req.body.direction)) {
      return res.status(400).send({ message: 'Invalid move direction. Valid values are: "up", "down", "left", "right".' });
    }

    const result = await Game.move(req.user.gameId, req.user.username, req.body.direction);
    return res.status(200).send(result);
  } catch (err) {
    console.error('POST /movements\n', err);
    return res.status(500).send({ message: 'Something went wrong' });
  }
});

app.post('/games', authenticate, async (req, res) => {
  try {
    const result = await Game.create(req.body.name, req.body.duration, req.body.mapId, req.body.isRanked);
    if (result.success) {
      return res.status(201).send({ id: result.id });
    } else {
      switch (result.error) {
        case 'GameExists':
          return res.status(409).send({ message: 'A game with the provided name already exists' });
        default:
          return res.status(500).send({ message: 'Something went wrong' });
      }
    }
  } catch (err) {
    console.error('POST /games\n', err);
    return res.status(500).send({ message: 'Something went wrong' });
  }
});

app.get('/games', authenticate, async (req, res) => {
  try {
    const gameList = await Game.list();
    return res.status(200).send(gameList);
  } catch (err) {
    console.error('GET /games\n', err);
    return res.status(500).send({ message: 'Something went wrong' });
  }
});

app.post('/games/:gameId/players', authenticate, async (req, res) => {
  try {
    const result = await Game.join(req.params.gameId, req.user.username);
    if (result.success) {
      return res.status(200).send(result.response);
    } else {
      switch (result.error) {
        case 'GameNotFound':
          return res.status(404).send({ message: 'Game not found' });
        default:
          return res.status(500).send({ message: 'Something went wrong' });
      }
    }
  } catch (err) {
    console.error('POST /games/:gameId/players\n', err);
    return res.status(500).send({ message: 'Something went wrong' });
  }
});

app.delete('/games/:gameId/players', authenticate, async (req, res) => {
  try {
    await Game.leave(req.params.gameId, req.user.username);

    return res.status(204).send();
  } catch (err) {
    console.error('DELETE /games/:gameId/players\n', err);
    return res.status(500).send({ message: 'Something went wrong' });
  }
});

app.get('/leaderboard', authenticate, validateHasActiveGame, async (req, res) => {
  try {
    const response = await Leaderboard.fetch(req.user.gameId, req.query.order, req.query.top);
    if (response.success) {
      res.status(200).send({ leaderboard: response.leaderboard });
    } else {
      switch (result.error) {
        case 'GameNotFound':
          return res.status(404).send({ message: 'Game not found' });
        default:
          return res.status(500).send({ message: 'Something went wrong' });
      }
    }
  } catch (err) {
    console.error('GET /leaderboard\n', err);
    return res.status(500).send({ message: 'Something went wrong' });
  }
});

app.get('/maps', authenticate, validateHasActiveGame, async (req, res) => {
  try {

  } catch (err) {
    console.error('GET /maps\n', err);
    return res.status(500).send({ message: 'Something went wrong' });
  }
})