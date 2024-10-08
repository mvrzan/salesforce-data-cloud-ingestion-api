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
    - [Where to get the variables](#where-to-get-the-variables)
    - [YAML template updates](#yaml-template-updates)
    - [AWS SAM deployment](#aws-sam-deployment)
  - [Using the public endpoint](#using-the-public-endpoint)
  - [Deployment to Azure](#deployment-to-azure)
  - [License](#license)
  - [Disclaimer](#disclaimer)

---

## What does it do?

The [Data Cloud Ingestion API](https://developer.salesforce.com/docs/atlas.en-us.c360a_api.meta/c360a_api/c360a_api_get_started.htm) enables users to push data into Data Cloud by streaming or bulk uploading the data. However, it is important to note that the Data Cloud Ingestion API is **NOT** a public endpoint and therefore cannot be easily accessed over public internet. The purpose of this project is to demonstrate how to leverage Amazon Web Services and Microsoft Azure to expose the Ingestion API via a public endpoint for easier consumption.

The provided node.js function handles the following:

- Accepts the incoming JSON payload
- Reads from a non-SQL database (DynamoDB or CosmosDB) for the token value and expiration
- If the token has expired, it fetches sensitive environment variables from the secure storage (Secrets Manager or Azure Key Vault)
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

The second step is to configure your Ingestion API connector within Data Cloud. Follow the official documentation [here](https://help.salesforce.com/s/articleView?id=sf.c360_a_connect_an_ingestion_source.htm&type=5). An example of a Ingestion API YAML schema can be found [here](https://help.salesforce.com/s/articleView?id=sf.c360_a_ingestion_api_schema_req.htm&type=5).

Once these steps are completed, it is time to deploy the function to your preferred cloud.

**Note:** There are multiple ways how code can be deployed to public clouds and there is no _right_ way of doing things. Proposed deployment steps are meant only as a ease of use and you are welcome to change them as you see fit.

## Deployment to AWS

As stated before, this is a simple example how to deploy this solution to AWS using the Serverless Application Model, also known as SAM. In this walkthrough, the [AWS CloudShell](https://docs.aws.amazon.com/cloudshell/latest/userguide/getting-started.html) will be used instead of a local terminal.

> Before you begin, please ensure you have a valid AWS account.

The first step is to update the `template.yaml` file with your environment-specific secrets. The following values need to be updated in the `template.yaml` file:

```
        {
          "CLIENT_ID": "2MO_w2n1AqT7ItBzfdas342fdasf897fdas",
          "USERNAME": "john.doe@example.com",
          "LOGIN_URL": "login.salesforce.com",
          "RSA_PRIVATE_KEY": "V3Q2RQZm93eGFvZW13Vys5OGFnQ1dCQTErZGlNMTkrc...",
          "INGESTION_SOURCE_API_NAME": "test-api"
        }
```

### Where to get the variables

CLIENT_ID can be gathered from the Connect App within the Salesforce instance and it is labeled `Consumer Key` once the Connected App is created.
USERNAME is the email address of the user logging into Salesforce
LOGIN_URL is exactly as the variable states `login.salesforce.com` and you can leave that one as is.
RSA_PRIVATE_KEY is the private key generated by your certificate and it comes in the following format:

```
-----BEGIN RSA PRIVATE KEY-----
MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu
KUpRKfFLfRYC9AIKjbJTWit+CqvjWYzvQwECAwEAAQJAIJLixBy2qpFoS4DSmoEm
o3qGy0t6z09AIJtH+5OeRV1be+N4cDYJKffGzDa88vQENZiRm0GRq6a+HPGQMd2k
TQIhAKMSvzIBnni7ot/OSie2TmJLY4SwTQAevXysE2RbFDYdAiEBCUEaRQnMnbp7
9mxDXDf6AU0cN/RPBjb9qSHDcWZHGzUCIG2Es59z8ugGrDY+pxLQnwfotadxd+Uy
v/Ow5T0q5gIJAiEAyS4RaI9YG8EWx/2w0T67ZUVAw8eOMB6BIUg0Xcu+3okCIBOs
/5OiPgoTdSy7bcF9IGpSE8ZgGKzgYQVZeN97YE00
-----END RSA PRIVATE KEY-----
```

Make a copy of your key (yes, all of it) and encode it to a base64 format. This can be done by simply going to any base64 encode website (here's an example: https://www.base64encode.org/) and then take the note of the encoded string:

```
LS0tLS1CRUdJTiBSU0EgUFJJVkFURSBLRVktLS0tLQpNSUlCT2dJQkFBSkJBS2ozNEdreEZoRDkwdmNOTFlMSW5GRVg2UHB5MXRQZjlDbnpqNHA0V0dlS0xzMVB0OFF1CktVcFJLZkZMZlJZQzlBSUtqYkpUV2l0K0NxdmpXWXp2UXdFQ0F3RUFBUUpBSUpMaXhCeTJxcEZvUzREU21vRW0KbzNxR3kwdDZ6MDlBSUp0SCs1T2VSVjFiZStONGNEWUpLZmZHekRhODh2UUVOWmlSbTBHUnE2YStIUEdRTWQyawpUUUloQUtNU3Z6SUJubmk3b3QvT1NpZTJUbUpMWTRTd1RRQWV2WHlzRTJSYkZEWWRBaUVCQ1VFYVJRbk1uYnA3CjlteERYRGY2QVUwY04vUlBCamI5cVNIRGNXWkhHelVDSUcyRXM1OXo4dWdHckRZK3B4TFFud2ZvdGFkeGQrVXkKdi9PdzVUMHE1Z0lKQWlFQXlTNFJhSTlZRzhFV3gvMncwVDY3WlVWQXc4ZU9NQjZCSVVnMFhjdSszb2tDSUJPcwovNU9pUGdvVGRTeTdiY0Y5SUdwU0U4WmdHS3pnWVFWWmVOOTdZRTAwCi0tLS0tRU5EIFJTQSBQUklWQVRFIEtFWS0tLS0t
```

This encoded string is going to be your `RSA_PRIVATE_KEY` variable.

**Note:** We have encoded the key because otherwise, the Secrets Manager would break the formatting casing issues with the authentication.

### YAML template updates

Once you have all the variables in your `template.yaml` file, save the file and proceed to the next step.

The next step is to zip the contents of the `aws/` folder. This means you will zip the following files and folders:

```
template.yaml
src/
 ├── index.js
 └── package.json
 └── package-lock.json
```

> Does this structure matter? Yes, it does matter as a specific folder structure has to be followed when uploading a Lambda function.

### AWS SAM deployment

Log into the AWS Console and open the AWS CloudShell by clicking on the CloudShell icon in the bottom left of the AWS Console.

Once the CloudShell terminal opens, on the right-hand side, you will see a button labeled **Actions**. Click on it and select **Upload file** and select your zip file.

Run the following commands in the CloudShell:

```
unzip <name-of-your-zip-file>
sam build
```

Once the build step finishes, run the following command:

```
sam deploy --guided
```

This step will guide you through the deployment and ask the following questions:

```
 Stack Name [sam-app]: the name of the CloudFormation stack that will be deployed

 AWS Region [us-east-2]: default AWS region where this stack will be deployed

 Shows you resources changes to be deployed and require a 'Y' to initiate deploy: do you want an extra validation step before deploying the resources

 SAM needs permission to be able to create roles to connect to the resources in your template: allow SAM to create roles to connect the necessary resources

 preserves the state of previously provisioned resources when an operation fails: do you want to keep the deployed resources in case something fails

 DataCloudIngestionFunction has no authentication. Is this okay? [y/N]: Yes, this is ok for this example

 Save arguments to configuration file [Y/n]: Do you want to save the arguments for future use?

```

Once the deployment is successful, you will see the endpoint URL in the terminal output section and you can send your requests there!

That is it! You have successfully deployed this project into an AWS account using SAM.

**NOTE:** Please note that you have now deployed a public endpoint with 0 authentication. You bare all the responsibility for having unauthenticated public endpoint that may incur unforeseen costs to your AWS account. This is a simple proof of concept, hence why there is not authentication in place.

## Using the public endpoint

Once you have the endpoint deployed, you are able to use it by passing the Data Cloud Ingestion API object name into the query parameters. Here's an example:

`https://8fdsa980.execute-api.us-east-2.amazonaws.com/dataCloudIngestionApi?objectName=UserLoggedIn`

The portion after your endpoint `objectName=<objectName>` is what is going to point to the Data Cloud Ingestion API connector which event it should process (these events you've defined in your YAML schema).

## Deployment to Azure

Compared to the AWS option, I will not go through step by step process on how to deploy the solution on top of Azure. Why? Mostly because my Azure account has limited permissions and I cannot validate if it is working properly or not. For details on Azure cloud deployments, explore the [official documentation](https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/deploy-cli).

## License

[MIT](http://www.opensource.org/licenses/mit-license.html)

## Disclaimer

This software is to be considered "sample code", a Type B Deliverable, and is delivered "as-is" to the user. Salesforce bears no responsibility to support the use or implementation of this software.
