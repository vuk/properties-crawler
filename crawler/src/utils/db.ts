import { DynamoDBClient, type DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { Property } from '../adapters/abstract-adapter';

export class Database {
    private static instance: Database;
    private constructor() {}
    private docClient: DynamoDBDocumentClient | undefined;

    public static getInstance(): Database {
        if (!this.instance) {
            this.instance = new Database();
        }
        return this.instance;
    }

    public async connect(): Promise<void> {
        const config: DynamoDBClientConfig =
            process.env.IS_OFFLINE === 'true'
                ? {
                      region: 'localhost',
                      endpoint: 'http://localhost:8000',
                      credentials: {
                          accessKeyId: 'DEFAULT_ACCESS_KEY',
                          secretAccessKey: 'DEFAULT_SECRET',
                      },
                  }
                : {
                      region: process.env.AWS_REGION,
                      credentials:
                          process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
                              ? {
                                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                                }
                              : undefined,
                  };

        const client = new DynamoDBClient(config);
        this.docClient = DynamoDBDocumentClient.from(client, {
            marshallOptions: { removeUndefinedValues: true },
        });
    }

    private get client(): DynamoDBDocumentClient {
        if (!this.docClient) {
            throw new Error('Database not connected; call connect() first');
        }
        return this.docClient;
    }

    async putProperty(property: Property): Promise<void> {
        let existing = await this.getItemByURL(property.propertyUrl);
        if (!existing) {
            existing = property;
        }
        existing = this.prepareItem(existing) as Property;
        const tableName = process.env.PROPERTY_TABLE;
        if (!tableName) {
            throw new Error('PROPERTY_TABLE is not set');
        }
        await this.client.send(
            new PutCommand({
                TableName: tableName,
                Item: existing as any,
            }),
        );
    }

    private prepareItem(item: any): any {
        for (const prop in item) {
            if (Object.prototype.hasOwnProperty.call(item, prop)) {
                if (item[prop] === '') {
                    item[prop] = '---empty---';
                } else if (typeof item[prop] === 'object' && item[prop] !== null) {
                    this.prepareItem(item[prop]);
                }
            }
        }
        return item;
    }

    private cleanItem(item: any): any {
        for (const prop in item) {
            if (Object.prototype.hasOwnProperty.call(item, prop)) {
                if (item[prop] === '---empty---') {
                    item[prop] = '';
                } else if (typeof item[prop] === 'object' && item[prop] !== null) {
                    this.cleanItem(item[prop]);
                }
            }
        }
        return item;
    }

    async getItemById(id: string, propertyType = 0): Promise<Property | null> {
        const tableName = process.env.PROPERTY_TABLE;
        if (!tableName) {
            throw new Error('PROPERTY_TABLE is not set');
        }
        const dbResponse = await this.client.send(
            new GetCommand({
                TableName: tableName,
                Key: { id, propertyType },
            }),
        );
        if (!dbResponse.Item) {
            return null;
        }
        return this.cleanItem(dbResponse.Item) as Property;
    }

    async getItemByURL(url: string): Promise<Property | null> {
        const tableName = process.env.PROPERTY_TABLE;
        if (!tableName) {
            throw new Error('PROPERTY_TABLE is not set');
        }
        const dbResponse = await this.client.send(
            new QueryCommand({
                TableName: tableName,
                IndexName: 'urlGSI',
                KeyConditionExpression: 'propertyUrl = :url',
                ExpressionAttributeValues: {
                    ':url': url,
                },
            }),
        );
        if (!dbResponse.Items || dbResponse.Items.length === 0) {
            return null;
        }
        return this.cleanItem(dbResponse.Items[0]) as Property;
    }
}
