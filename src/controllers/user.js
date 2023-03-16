import { CacheDictionaryGetFields } from '@gomomento/sdk';
import { getCacheClient } from '../services/momento.js';

class UserSession {
  constructor(username, signInTime, gameId) {
    this.username = username;
    this.signInTime = signInTime;
    this.gameId = gameId;
  }

  static async load(user) {
    let signInTime, gameId;
    const momento = await getCacheClient(['user']);
    const sessionResponse = await momento.dictionaryGetFields('user', user.username, ['gameId', 'signInTime']);
    if (sessionResponse instanceof CacheDictionaryGetFields.Miss) {
      const signIn = new Date().toISOString();
      await momento.dictionarySetFields('user', user.username, { signInTime: signIn });
      signInTime = signInTime;
    } else {
      const userSession = sessionResponse.valueRecord();
      gameId = userSession.gameId;
      signInTime = userSession.signInTime;
    }

    return new UserSession(user.username, signInTime, gameId);
  };
}

export default UserSession;