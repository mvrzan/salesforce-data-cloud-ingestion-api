import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { CosmosClient } from "@azure/cosmos";
import fetch from "node-fetch";
import jwt from "jsonwebtoken";

// create global variables to store the JWT token and its expiration time
let cachedJwt; // JWT token
let cachedJwtExpiresAt; // JWT token expiration time
let dataCloudInstanceUrl; // Data Cloud instance URL
let fetchedDataCloudInstanceUrl; // Data Cloud instance URL fetched from the token exchange
let fetchedDataCloudToken; // Data Cloud token fetched from the token exchange

// create global variables to store Azure Key Vault secrets
let secret;
let clientId;
let username;
let privateKey;
let loginUrl;
let ingestionSourceApiName;

// Initialize Azure Key Vault client
const credential = new DefaultAzureCredential();
const keyVaultName = process.env.KEY_VAULT_NAME;
const keyVaultUrl = `https://${keyVaultName}.vault.azure.net`;
const secretClient = new SecretClient(keyVaultUrl, credential);

// Initialize Cosmos DB client
const cosmosEndpoint = process.env.COSMOS_DB_ENDPOINT;
const cosmosKey = process.env.COSMOS_DB_KEY;
const cosmosClient = new CosmosClient({
  endpoint: cosmosEndpoint,
  key: cosmosKey,
});
const databaseId = process.env.COSMOS_DB_DATABASE_ID;
const containerId = process.env.COSMOS_DB_CONTAINER_ID;

export const getSfToken = async () => {
  try {
    // check if the secret is empty
    if (!secret) {
      console.log("No cached secrets found. Fetching new secrets!");

      // Retrieve secrets from Azure Key Vault
      const { value: clientIdSecret } = await secretClient.getSecret(
        "CLIENT-ID"
      );
      const { value: usernameSecret } = await secretClient.getSecret(
        "USERNAME"
      );
      const { value: privateKeySecret } = await secretClient.getSecret(
        "RSA-PRIVATE-KEY"
      );
      const { value: loginUrlSecret } = await secretClient.getSecret(
        "LOGIN-URL"
      );
      const { value: ingestionSourceApiNameSecret } =
        await secretClient.getSecret("INGESTION-SOURCE-API-NAME");

      // set global variables with the fetched secrets
      clientId = clientIdSecret;
      username = usernameSecret;
      privateKey = privateKeySecret;
      loginUrl = loginUrlSecret;
      ingestionSourceApiName = ingestionSourceApiNameSecret;
      secret = true;
    }

    // check if the JWT token is empty
    if (!cachedJwt) {
      console.log("No cached JWT token found. Fetching a new token!");

      // fetch the last JWT token from the Cosmos DB container
      const { database } = await cosmosClient.databases.createIfNotExists({
        id: databaseId,
      });
      const { container } = await database.containers.createIfNotExists({
        id: containerId,
      });
      const { resources: items } = await container.items
        .query({ query: "SELECT * FROM c" })
        .fetchAll();

      if (items.length >= 1) {
        const lastRecord = items[items.length - 1];
        cachedJwt = lastRecord.jwt;
        cachedJwtExpiresAt = lastRecord.expires_at;
        dataCloudInstanceUrl = lastRecord.dataCloudInstanceUrl;
      }
    }

    // check if the token is still valid
    if (
      !cachedJwtExpiresAt ||
      cachedJwtExpiresAt - Math.round(Date.now() / 1000) < 3600
    ) {
      console.log("Token is expired. Fetching a new token!");

      // define jwt payload
      const tokenPayload = {
        iss: clientId,
        sub: username,
        aud: loginUrl,
        exp: Math.round(Date.now() / 1000),
      };

      // decode base64 encoded rsa key from the Azure Key Vault
      const rsaKey = Buffer.from(privateKey, "base64").toString("ascii");

      // create and sign jwt
      const token = jwt.sign(tokenPayload, rsaKey, {
        algorithm: "RS256",
      });

      // Salesforce CRM Access Token Payload
      const salesforceCrmTokenPayload = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: token,
      });

      // Salesforce CRM Access Token Request
      const salesforceCrmResponse = await fetch(
        `https://${loginUrl}/services/oauth2/token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: salesforceCrmTokenPayload,
        }
      );

      if (!salesforceCrmResponse.ok) {
        throw new Error("HTTP error, status = " + salesforceCrmResponse.status);
      }

      const salesforceCrmResponseData = await salesforceCrmResponse.json();

      // Data Cloud Token Exchange Payload
      const dataCloudPayload = new URLSearchParams({
        grant_type: "urn:salesforce:grant-type:external:cdp",
        subject_token: salesforceCrmResponseData.access_token,
        subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
      });

      // Data Cloud Token Exchange Request
      const dataCloudResponse = await fetch(
        `${salesforceCrmResponseData.instance_url}/services/a360/token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: dataCloudPayload,
        }
      );

      if (!dataCloudResponse.ok) {
        const status = dataCloudResponse.status;
        const errorText = dataCloudResponse.statusText;
        console.error("Data Cloud Token Exchange Error:", errorText);
        throw new Error(
          `HTTP error when exchanging token with Data Cloud, status = ${status}`
        );
      }

      // parse the response from the Data Cloud token exchange
      const dataCloudResponseData = await dataCloudResponse.json();
      const dataCloudInstanceUrl = dataCloudResponseData.instance_url;

      // store the fetched JWT token and its expiration time
      fetchedDataCloudToken = dataCloudResponseData.access_token;
      fetchedDataCloudInstanceUrl = dataCloudInstanceUrl;

      // store the fetched JWT token and its expiration time in Cosmos DB
      const tokenExpiration =
        dataCloudResponseData.expires_in + Math.round(Date.now() / 1000);
      const { database } = await cosmosClient.databases.createIfNotExists({
        id: databaseId,
      });
      const { container } = await database.containers.createIfNotExists({
        id: containerId,
      });

      await container.items.upsert({
        jwt: fetchedDataCloudToken,
        expires_at: tokenExpiration,
        dataCloudInstanceUrl,
      });

      return {
        token: fetchedDataCloudToken,
        dataCloudInstanceUrl,
        ingestionSourceApiName,
      };
    }

    return {
      token: cachedJwt,
      dataCloudInstanceUrl,
      ingestionSourceApiName,
    };
  } catch (error) {
    console.log.error("Error has occurred:", error);
    const errorResponse = {
      status: 500,
      body: "There was an issue with the Azure helper function: " + error,
    };

    return errorResponse;
  }
};
