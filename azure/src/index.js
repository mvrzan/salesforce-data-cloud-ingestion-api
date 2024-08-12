const { DefaultAzureCredential } = require("@azure/identity");
const { SecretClient } = require("@azure/keyvault-secrets");
const { CosmosClient } = require("@azure/cosmos");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const credential = new DefaultAzureCredential();
const keyVaultName = process.env.KEY_VAULT_NAME;
const keyVaultUrl = `https://${keyVaultName}.vault.azure.net`;
const secretClient = new SecretClient(keyVaultUrl, credential);

const cosmosEndpoint = process.env.COSMOS_DB_ENDPOINT;
const cosmosKey = process.env.COSMOS_DB_KEY;
const cosmosClient = new CosmosClient({
  endpoint: cosmosEndpoint,
  key: cosmosKey,
});
const databaseId = process.env.COSMOS_DB_DATABASE_ID;
const containerId = process.env.COSMOS_DB_CONTAINER_ID;

module.exports = async function (context, req) {
  context.log("JavaScript HTTP trigger function processed a request.");

  try {
    // Retrieve secrets from Azure Key Vault
    const clientId = await secretClient.getSecret("ClientId");
    const username = await secretClient.getSecret("Username");
    const privateKey = await secretClient.getSecret("PrivateKey");

    // Check if the token is still valid
    const token = await getTokenFromCosmosDB();
    if (token && !isTokenExpired(token)) {
      context.res = {
        status: 200,
        body: token,
      };
      return;
    }

    // Create JWT payload
    const jwtPayload = {
      iss: clientId.value,
      sub: username.value,
      aud: "https://login.salesforce.com",
      exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour expiration
    };

    // Sign JWT
    const signedJwt = jwt.sign(jwtPayload, privateKey.value, {
      algorithm: "RS256",
    });

    // Request access token from Salesforce
    const response = await axios.post(
      "https://login.salesforce.com/services/oauth2/token",
      null,
      {
        params: {
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: signedJwt,
        },
      }
    );

    const accessToken = response.data.access_token;

    // Store the token in Cosmos DB
    await storeTokenInCosmosDB(accessToken);

    context.res = {
      status: 200,
      body: accessToken,
    };
  } catch (error) {
    context.log.error("Error processing request:", error);
    context.res = {
      status: 500,
      body: "Internal Server Error",
    };
  }
};

async function getTokenFromCosmosDB() {
  const { database } = await cosmosClient.databases.createIfNotExists({
    id: databaseId,
  });
  const { container } = await database.containers.createIfNotExists({
    id: containerId,
  });

  const { resources: items } = await container.items
    .query('SELECT * FROM c WHERE c.id = "token"')
    .fetchAll();
  return items.length > 0 ? items[0].token : null;
}

function isTokenExpired(token) {
  const decoded = jwt.decode(token);
  return decoded.exp < Math.floor(Date.now() / 1000);
}

async function storeTokenInCosmosDB(token) {
  const { database } = await cosmosClient.databases.createIfNotExists({
    id: databaseId,
  });
  const { container } = await database.containers.createIfNotExists({
    id: containerId,
  });

  await container.items.upsert({ id: "token", token });
}
