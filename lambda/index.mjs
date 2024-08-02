/* global fetch */

import jwt from "jsonwebtoken";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

// read a jwt token from data-cloud-jwt dynamodb table
const dynamodbClient = new DynamoDBClient();
const dynamo = DynamoDBDocumentClient.from(dynamodbClient);
const tableName = "data-cloud-jwt";
let tokenCached;

try {
  const { Items } = await dynamo.send(
    new ScanCommand({
      TableName: tableName,
    })
  );

  if (Items.length >= 1) {
    const lastRecord = Items[Items.length - 1];
    const jwtToken = lastRecord.jwt;

    console.log("JWT Token", jwtToken);
  } else {
    tokenCached = false;
    console.log("No JWT token found in the table");
  }
} catch (error) {
  console.error(error);
  throw error;
}

// get the secret from AWS Secrets Manager
const secret_name = "data-cloud-makana";
const client = new SecretsManagerClient({
  region: "us-east-2",
});

let response;

try {
  response = await client.send(
    new GetSecretValueCommand({
      SecretId: secret_name,
      VersionStage: "AWSCURRENT",
    })
  );
} catch (error) {
  console.error(error);
  throw error;
}

const secret = JSON.parse(response.SecretString);

export const handler = async (event) => {
  // fetch Salesforce token
  console.log("Fetching Salesforce CRM token!");

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

  // Token Exchange Request logic
  try {
    // Salesforce CRM Access Token Payload
    const salesforceCrmTokenPayload = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: token,
    });
    const salesforceCrmResponse = await fetch(
      "https://" + secret.LOGIN_URL + "/services/oauth2/token",
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
      salesforceCrmResponseData.instance_url + "/services/a360/token",
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

    const dataCloudResponseData = await dataCloudResponse.json();
    const dataCloudInstanceUrl = dataCloudResponseData.instance_url;
    const tokenExpiration = dataCloudResponseData.expires_in;
    const body = JSON.parse(event.body);
    const dataCloudObject = {
      data: [body],
    };

    if (!tokenCached) {
      // save jwt token to dynamodb
      try {
        await dynamo.send(
          new PutCommand({
            TableName: tableName,
            Item: {
              jwt: token,
              expires_in: tokenExpiration,
            },
          })
        );
      } catch (error) {
        console.error(error);
        throw error;
      }
    }

    // Data Cloud Object Request
    const dataCloudIngestionApiResponse = await fetch(
      "https://" +
        dataCloudInstanceUrl +
        `/api/v1/ingest/sources/${secret.INGESTION_SOURCE_API_NAME}/${event.queryStringParameters.objectName}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cdpResponseData.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dataCloudObject),
      }
    );

    console.log(
      "Data Cloud Response",
      await dataCloudIngestionApiResponse.json()
    );

    const lambdaResponse = {
      statusCode: 200,
      body: JSON.stringify(
        "The following data was just sent to Data Cloud: " + dataCloudObject
      ),
    };

    return lambdaResponse;
  } catch (error) {
    console.log("Error", error);
  }
};
