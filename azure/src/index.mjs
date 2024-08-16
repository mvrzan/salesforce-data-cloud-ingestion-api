import { getSfToken } from "./getSfToken.mjs";

export const handler = async (context, req) => {
  try {
    context.log("Azure Function handler called");
    const { token, dataCloudInstanceUrl, ingestionSourceApiName } =
      await getSfToken();

    // Data Cloud Ingestion API URL
    const dataCloudIngestionApiUrl = `https://${dataCloudInstanceUrl}/api/v1/ingest/sources/${ingestionSourceApiName}/${req.query.objectName}`;
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
