/* global fetch */

import jwt from "jsonwebtoken";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

// initialize DynamoDB client
const dynamodbClient = new DynamoDBClient();
const dynamo = DynamoDBDocumentClient.from(dynamodbClient);
const tableName = "data-cloud-jwt";

// create global variables to store the JWT token and its expiration time
let cachedJwt; // JWT token
let cachedJwtExpiresAt; // JWT token expiration time
let dataCloudInstanceUrl; // Data Cloud instance URL
let fetchedDataCloudInstanceUrl; // Data Cloud instance URL fetched from the token exchange
let fetchedDataCloudToken; // Data Cloud token fetched from the token exchange

// fetch the last JWT token from the DynamoDB table
try {
  const { Items } = await dynamo.send(
    new ScanCommand({
      TableName: tableName,
    })
  );

  // check if there is a JWT token in the DynamoDB table
  if (Items.length >= 1) {
    const lastRecord = Items[Items.length - 1];
    cachedJwt = lastRecord.jwt;
    cachedJwtExpiresAt = lastRecord.expires_at;
    dataCloudInstanceUrl = lastRecord.dataCloudInstanceUrl;
  }
} catch (error) {
  console.error(error);
}

// initialize AWS Secrets Manager client
const secret_name = "data-cloud-makana";
const client = new SecretsManagerClient({
  region: "us-east-2",
});

let response;

// get the secret from AWS Secrets Manager
try {
  response = await client.send(
    new GetSecretValueCommand({
      SecretId: secret_name,
      VersionStage: "AWSCURRENT",
    })
  );
} catch (error) {
  console.error(error);
}

// parse the secret string on a global variable
const secret = JSON.parse(response.SecretString);

export const handler = async (event) => {
  // check if the token is still valid
  if (
    !cachedJwtExpiresAt ||
    cachedJwtExpiresAt - Math.round(Date.now() / 1000) < 3600
  ) {
    console.log("Token is expired. Fetching a new token!");

    // define jwt payload
    const tokenPayload = {
      iss: secret.CLIENT_ID,
      sub: secret.USERNAME,
      aud: secret.LOGIN_URL,
      exp: Math.round(Date.now() / 1000),
    };

    // decode base64 encoded rsa key from the AWS Secret Manager
    const rsaKey = Buffer.from(secret.RSA_PRIVATE_KEY, "base64").toString(
      "ascii"
    );

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
      `https://${secret.LOGIN_URL}/services/oauth2/token`,
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
      throw new Error("HTTP error, status = " + dataCloudResponse.status);
    }

    // parse the response from the Data Cloud token exchange
    const dataCloudResponseData = await dataCloudResponse.json();
    const dataCloudInstanceUrl = dataCloudResponseData.instance_url;

    // store the fetched JWT token and its expiration time
    fetchedDataCloudToken = dataCloudResponseData.access_token;
    fetchedDataCloudInstanceUrl = dataCloudInstanceUrl;

    // save jwt token to dynamodb
    const tokenExpiration =
      dataCloudResponseData.expires_in + Math.round(Date.now() / 1000);
    try {
      await dynamo.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            jwt: dataCloudResponseData.access_token,
            expires_at: tokenExpiration,
            dataCloudInstanceUrl,
          },
        })
      );
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  try {
    // Data Cloud Ingestion API URL
    const dataCloudIngestionApiUrl = `https://${
      dataCloudInstanceUrl ? dataCloudInstanceUrl : fetchedDataCloudInstanceUrl
    }/api/v1/ingest/sources/${secret.INGESTION_SOURCE_API_NAME}/${
      event.queryStringParameters.objectName
    }`;
    const body = JSON.parse(event.body);
    const dataCloudObject = {
      data: [body],
    };

    // Data Cloud Ingestion API Request
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

    if (!dataCloudIngestionApiResponse.ok) {
      throw new Error(
        "HTTP error, status = " + dataCloudIngestionApiResponse.status
      );
    }

    const successfulResponse = {
      statusCode: 200,
      body: JSON.stringify(
        "The following data was just sent to Data Cloud: " +
          JSON.stringify(dataCloudObject)
      ),
    };

    return successfulResponse;
  } catch (error) {
    console.error("Error", error);
    const errorResponse = {
      statusCode: 500,
      body: JSON.stringify("There was an issue with the Lambda function!"),
      error: error.message,
    };

    return errorResponse;
  }
};
