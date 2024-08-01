/* global fetch */

import jwt from "jsonwebtoken";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

// read a jwt token from data-cloud-jwt dynamodb table
const dynamodbClient = new DynamoDBClient();
const dynamo = DynamoDBDocumentClient.from(dynamodbClient);
const tableName = "data-cloud-jwt";

try {
  const { Items } = await dynamo.send(
    new ScanCommand({
      TableName: tableName,
    })
  );
  const lastRecord = Items[Items.length - 1];
  const jwtToken = lastRecord.jwt;

  console.log("JWT Token", jwtToken);
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
  console.log("Fetching Salesforce token");

  // define jwt payload
  const payload = {
    iss: secret.CLIENT_ID,
    sub: secret.USERNAME,
    aud: secret.LOGIN_URL,
    exp: Math.round(Date.now() / 1000),
  };

  const rsaKey = Buffer.from(secret.RSA_PRIVATE_KEY, "base64").toString(
    "ascii"
  );

  // create and sign jwt
  const token = jwt.sign(payload, rsaKey, {
    algorithm: "RS256",
  });

  // S2S Access Token Payload
  const data = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: token,
  });

  try {
    const response = await fetch(
      "https://" + secret.LOGIN_URL + "/services/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: data,
      }
    );

    if (!response.ok) {
      throw new Error("HTTP error, status = " + response.status);
    }

    const responseData = await response.json();

    const cdpData = new URLSearchParams({
      grant_type: "urn:salesforce:grant-type:external:cdp",
      subject_token: responseData.access_token,
      subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
    });

    // CDP Token Exchange Request
    const cdpResponse = await fetch(
      responseData.instance_url + "/services/a360/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: cdpData,
      }
    );

    if (!cdpResponse.ok) {
      throw new Error("HTTP error, status = " + cdpResponse.status);
    }

    const cdpResponseData = await cdpResponse.json();
    const dataCloudInstanceUrl = cdpResponseData.instance_url;
    const body = JSON.parse(event.body);
    const dataCloudObject = {
      data: [body],
    };

    // Data Cloud Object Request
    const dataCloudResponse = await fetch(
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

    console.log("Data Cloud Response", await dataCloudResponse.json());

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
