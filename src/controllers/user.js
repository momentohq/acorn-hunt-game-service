import { CacheDictionaryGetFields } from '@gomomento/sdk';
import { getCacheClient } from '../services/momento.js';

class UserSession {
  constructor(username, signInTime, gameId, connectionId) {
    this.username = username;
    this.signInTime = signInTime;
    this.gameId = gameId;
    this.connectionId = connectionId;
  }

  static async load(username) {
    let signInTime, gameId, connectionId;
    const cacheClient = await getCacheClient();
    const sessionResponse = await cacheClient.dictionaryGetFields('user', username, ['currentGameId', 'signInTime', 'wsConnectionId']);
    if (sessionResponse instanceof CacheDictionaryGetFields.Miss) {
      const signIn = new Date().toISOString();
      await cacheClient.dictionarySetFields('user', username, { signInTime: signIn });
      signInTime = signInTime;
    } 
    else if ( sessionResponse instanceof CacheDictionaryGetFields.Error){
      console.error(sessionResponse.errorCode, sessionResponse.message);
    }
    else {
      const userSession = sessionResponse.valueRecord();
      gameId = userSession.currentGameId;
      signInTime = userSession.signInTime;
      connectionId = userSession.wsConnectionId;
    }

    return new UserSession(username, signInTime, gameId, connectionId);
  };
}

export default UserSession;