import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
const secrets = new SecretsManagerClient();
let cachedSecrets;

/**
 * Gets the value of specific secret from Secrets Manager
 * 
 * @param {string} secretKey - Name of the secret stored in a JSON object in Secrets Manager
 * @returns string - The value of the secret
 */
const getSecret = async (secretKey) => {
  if (cachedSecrets) {
    return cachedSecrets[secretKey];
  } else {
    const secretResponse = await secrets.send(new GetSecretValueCommand({ SecretId: process.env.SECRET_ID }));
    if (secretResponse) {
      cachedSecrets = JSON.parse(secretResponse.SecretString);
      return cachedSecrets[secretKey];
    }
  }
};

export default getSecret;