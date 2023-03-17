import jwt from 'jsonwebtoken';
import getSecret from '../services/secrets.js';
import UserSession from './user.js';

export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization ?? req.header.Authorization;
  const token = authHeader ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ error: 'Token not provided' });
  }

  try {
    const secretKey = await getSecret('signature');
    const decoded = await jwt.verify(token, secretKey);

    req.user = decoded;
    next();
  } catch (err) {
    console.warn({ error: 'An invalid auth token was provided' });
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const validateHasActiveGame = async (req, res, next) => {
  try {
    const userSession = await UserSession.load(req.user.username);
    if (!userSession.gameId) {
      return res.status(409).send({ message: 'You are not part of an active game' });
    }
    req.user.gameId = userSession.gameId;
    req.user.signInTime = userSession.signInTime;
    next();
  } catch (err) {
    console.error('Error validating active game');
    return res.status(500).send({ message: 'Something went wrong' });
  }
};