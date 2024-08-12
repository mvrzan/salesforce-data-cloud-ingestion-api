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
  - [Install the AWS CLI](#install-the-aws-cli)
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

## Install the AWS CLI

The very first step in deploying the AWS infrastructure is to install the AWS command line. The instructions can be found [here](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html).

## License

[MIT](http://www.opensource.org/licenses/mit-license.html)

## Disclaimer

This software is to be considered "sample code", a Type B Deliverable, and is delivered "as-is" to the user. Salesforce bears no responsibility to support the use or implementation of this software.
