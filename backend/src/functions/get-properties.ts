import { DynamoDBClient, type DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

export const handler = async () => {
    const config: DynamoDBClientConfig =
        process.env.IS_OFFLINE === 'true'
            ? {
                  region: 'localhost',
                  endpoint: 'http://localhost:8080',
                  credentials: {
                      accessKeyId: 'DEFAULT_ACCESS_KEY',
                      secretAccessKey: 'DEFAULT_SECRET',
                  },
              }
            : {};

    const client = new DynamoDBClient(config);
    const docClient = DynamoDBDocumentClient.from(client, {
        marshallOptions: { removeUndefinedValues: true },
    });

    const tableName = process.env.PROPERTIES_TABLE;
    if (!tableName) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'PROPERTIES_TABLE is not configured' }),
        };
    }

    const result = await docClient.send(
        new QueryCommand({
            TableName: tableName,
            IndexName: 'itemTypeGSI',
            KeyConditionExpression: 'propertyType = :val',
            ExpressionAttributeValues: {
                ':val': 0,
            },
            ScanIndexForward: true,
            Select: 'ALL_ATTRIBUTES',
            ReturnConsumedCapacity: 'TOTAL',
        }),
    );

    return {
        statusCode: 200,
        body: JSON.stringify({
            items: result.Items ?? [],
            lastEvaluatedKey: result.LastEvaluatedKey ?? null,
        }),
    };
};
