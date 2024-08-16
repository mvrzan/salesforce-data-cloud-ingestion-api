/* global fetch */

import { getSfToken } from "./utils/getSfToken.mjs";

export const handler = async (event) => {
  try {
    console.log("Lambda Function handler called");
    const { token, dataCloudInstanceUrl, ingestionSourceApiName } =
      await getSfToken();

    // Data Cloud Ingestion API URL
    const dataCloudIngestionApiUrl = `https://${dataCloudInstanceUrl}/api/v1/ingest/sources/${ingestionSourceApiName}/${event.queryStringParameters.objectName}`;
    const body = JSON.parse(event.body);
    const dataCloudObject = {
      data: [body],
    };

    // Send data to Data Cloud Ingestion API endpoint
    const dataCloudIngestionApiResponse = await fetch(
      dataCloudIngestionApiUrl,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
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

    const successfulResponse = {
      statusCode: 200,
      body: JSON.stringify(
        "The following data was just sent to Data Cloud: " +
          JSON.stringify(dataCloudObject)
      ),
    };

    return successfulResponse;
  } catch (error) {
    console.error("Error has occurred:", error);
    const errorResponse = {
      statusCode: 500,
      body: JSON.stringify(
        `There was an issue with the Lambda function: ${error}`
      ),
    };

    return errorResponse;
  }
};
