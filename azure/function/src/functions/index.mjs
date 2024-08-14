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

// Initialize Azure Key Vault client
const credential = new DefaultAzureCredential();
const keyVaultName = process.env.KEY_VAULT_NAME;
const keyVaultUrl = `https://${keyVaultName}.vault.azure.net`;
const secretClient = new SecretClient(keyVaultUrl, credential);

console.log("Azure Key Vault successfully initialized.");

// Retrieve secrets from Azure Key Vault
const { value: clientId } = await secretClient.getSecret("CLIENT-ID");
const { value: username } = await secretClient.getSecret("USERNAME");
const { value: salesforceInstanceUrl } = await secretClient.getSecret(
  "SALESFORCE-INSTANCE-URL"
);
const { value: privateKey } = await secretClient.getSecret("RSA-PRIVATE-KEY");
const { value: loginUrl } = await secretClient.getSecret("LOGIN-URL");
const { value: ingestionSourceApiName } = await secretClient.getSecret(
  "INGESTION-SOURCE-API-NAME"
);

// Initialize Cosmos DB client
const cosmosEndpoint = process.env.COSMOS_DB_ENDPOINT;
const cosmosKey = process.env.COSMOS_DB_KEY;
const cosmosClient = new CosmosClient({
  endpoint: cosmosEndpoint,
  key: cosmosKey,
});
const databaseId = process.env.COSMOS_DB_DATABASE_ID;
const containerId = process.env.COSMOS_DB_CONTAINER_ID;

// fetch the last JWT token from the Cosmos DB container
try {
  const { database } = await cosmosClient.databases.createIfNotExists({
    id: databaseId,
  });
  const { container } = await database.containers.createIfNotExists({
    id: containerId,
  });

  const { resources: items } = await container.items
    .query("SELECT * FROM c")
    .fetchAll();

  if (items.length >= 1) {
    const lastRecord = items[items.length - 1];
    cachedJwt = lastRecord.jwt;
    cachedJwtExpiresAt = lastRecord.expires_at;
    dataCloudInstanceUrl = lastRecord.dataCloudInstanceUrl;
  }
} catch (error) {
  console.error(error);
}

export const handler = async (context, req) => {
  try {
    context.log("Azure Function handler called");

    context.log("Request body:", req.body);
    context.log("Query string parameters:", req.query);

    // check if the token is still valid
    if (
      !cachedJwtExpiresAt ||
      cachedJwtExpiresAt - Math.round(Date.now() / 1000) < 3600
    ) {
      context.log("Token is expired. Fetching a new token!");

      // define jwt payload
      const tokenPayload = {
        iss: clientId,
        sub: username,
        aud: loginUrl,
        exp: Math.round(Date.now() / 1000),
      };

      // decode base64 encoded rsa key from the AWS Secret Manager
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
    }

    // Data Cloud Ingestion API URL
    const dataCloudIngestionApiUrl = `https://${
      dataCloudInstanceUrl ? dataCloudInstanceUrl : fetchedDataCloudInstanceUrl
    }/api/v1/ingest/sources/${ingestionSourceApiName}/${req.query.objectName}`;
    const body = req.body;
    const dataCloudObject = {
      data: [body],
    };

    // Send data to Data Cloud Ingestion API endpoint
    const dataCloudIngestionApiResponse = await fetch(
      dataCloudIngestionApiUrl,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${
            cachedJwt ? cachedJwt : fetchedDataCloudToken
          }`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dataCloudObject),
      }
    );

    // Check if the response is not successful
    if (!dataCloudIngestionApiResponse.ok) {
      const status = dataCloudIngestionApiResponse.status;
      const errorText = dataCloudIngestionApiResponse.statusText;
      console.error("Data Cloud Ingestion API Error:", errorText);
      throw new Error(
        `HTTP error when sending data to Data Cloud Ingestion API, status = ${status}`
      );
    }

    context.res = {
      status: 200,
      body: JSON.stringify(
        "The following data was just sent to Data Cloud: " +
          JSON.stringify(dataCloudObject)
      ),
    };
  } catch (error) {
    context.log.error("Error processing request:", error);
    context.res = {
      status: 500,
      body: "Internal Server Error:" + error,
    };
  }
};
