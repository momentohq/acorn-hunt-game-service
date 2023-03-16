import express from 'express';
import { authenticate, validateHasActiveGame } from './src/controllers/auth.js';
import { Leaderboard } from './src/controllers/leaderboard.js';
import { SuperAbility } from './src/controllers/superability.js';

const app = express();

app.listen(8000, () => { console.log('listening on port 8000') });

app.post('/points', authenticate, validateHasActiveGame, async (req, res) => {
  try {
    const score = await Leaderboard.updateScore(req.user.gameId, req.user.username, req.body.points);

    return res.status(200).send({ score });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ message: 'Something went wrong' });
  }
});

app.post('/super-abilities', authenticate, validateHasActiveGame, async (req, res) => {
  try {
    const newCount = await SuperAbility.increase(req.user.gameId, req.user.username, req.body.count);
    return res.status(200).send({ remaining: newCount });
  } catch (err) {
    console.error(err);
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
    console.error(err);
    return res.status(500).send({ message: 'Something went wrong' });
  }
});

app.post('/movements', authenticate, validateHasActiveGame, async (req, res) => {
  try {

  } catch (err) {
    console.error(err);
    return res.status(500).send({ message: 'Something went wrong' });
  }
});