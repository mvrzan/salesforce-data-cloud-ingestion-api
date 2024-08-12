<a  href="https://www.salesforce.com/">
<img  src="https://a.sfdcstatic.com/shared/images/c360-nav/salesforce-with-type-logo.svg"  alt="Salesforce"  width="250"  />
</a>

# Data Cloud Ingestion API via AWS and Azure

This project showcases how to use the Data Cloud Ingestion API via serverless architecture on top of Amazon Web Services (AWS) and Microsoft Azure.

# Table of Contents

- [Data Cloud Ingestion API via AWS and Azure](#data-cloud-ingestion-api-via-aws-and-azure)
- [Table of Contents](#table-of-contents)
  - [What does it do?](#what-does-it-do)
  - [How does it work?](#how-does-it-work)
    - [Architecture diagram](#architecture-diagram)
- [Configuration](#configuration)
  - [Requirements](#requirements)
  - [Deployment to AWS](#deployment-to-aws)
  - [Deployment to Azure](#deployment-to-azure)
  - [License](#license)
  - [Disclaimer](#disclaimer)

---

## What does it do?

The [Data Cloud Ingestion API](https://developer.salesforce.com/docs/atlas.en-us.c360a_api.meta/c360a_api/c360a_api_get_started.htm) enables users to push data into Data Cloud by streaming or bulk uploading the data. However, it is important to note that the Data Cloud Ingestion API is **NOT** a public endpoint and therefore cannot be easily accessed over public internet. The purpose of this project is to demonstrate how to leverage Amazon Web Services and Microsoft Azure to expose the Ingestion API via a public endpoint for easier consumption.

The provided node.js function handles the following:

- Accepts the incoming JSON payload
- Reads from a non-SQL database (DynamoDB or CosmosDB) for the token value and expiration
- If the token has expired, it fetches sensitive environmental variables from the secure storage (Secrets Manager or Azure Key Vault)
- Fetches the Salesforce Access Token
- Exchanges the Salesforce Access Token for Data Cloud Access Token
- Caches the new token into the non-SQL database for future use
- Parses the incoming payload data
- Finally, it pushes the data to the Data Cloud Ingestion API

## How does it work?

### Architecture diagram

| AWS Architecture                        | Azure Architecture                        |
| --------------------------------------- | ----------------------------------------- |
| ![](./screenshots/aws-architecture.png) | ![](./screenshots/azure-architecture.png) |

**NOTE:** Please be aware that this is just a simple example of the serverless architecture on both cloud platforms and production use cases might be different based on your company's security policies and best practices.

# Configuration

## Requirements

In order to deploy and test this application yourself, you first need to handle the authorization to your Salesforce instance:

In the [Get Started with Ingestion API](https://developer.salesforce.com/docs/atlas.en-us.c360a_api.meta/c360a_api/c360a_api_get_started.htm) official documentation, complete the **Authentication** portion where you create a [Connected App](https://help.salesforce.com/s/articleView?id=sf.connected_app_create.htm&type=5) in your Salesforce instance.

Once this step is completed, it is time to deploy the function to your preferred cloud.

**Note:** There are multiple ways how code can be deployed to public clouds and there is no _right_ way of doing things. Proposed deployment steps are meant only as a ease of use and you are welcome to change them as you see fit.

## Deployment to AWS

Before you begin, please ensure you have a valid AWS account.

## Deployment to Azure

Before you begin, please ensure you have a valid Azure account.

## License

[MIT](http://www.opensource.org/licenses/mit-license.html)

## Disclaimer

This software is to be considered "sample code", a Type B Deliverable, and is delivered "as-is" to the user. Salesforce bears no responsibility to support the use or implementation of this software.
