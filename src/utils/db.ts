import { DocumentClient } from 'aws-sdk/clients/dynamodb';
import { Property } from '../adapters/abstract-adapter';

export class Database {
    private static instance: Database;
    private constructor() { }
    private client: DocumentClient;

    public static getInstance(): Database {
        if (!this.instance) {
            this.instance = new Database();
        }
        return this.instance;
    }

    public async connect(): Promise<any> {
        if (process.env.IS_OFFLINE) {
            this.client = new DocumentClient({
                region: process.env.AWS_REGION,
                endpoint: `http://localhost:${process.env.AWS_LOCAL_PORT}`,
            });
        } else {
            this.client = new DocumentClient({
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                region: process.env.AWS_REGION
            });
        }
    }

    async putProperty(property: Property): Promise<any> {
        let existing = await this.getItemByURL(property.url);
        if (!existing) {
            existing = property;
        }
        existing = this.prepareItem(existing);
        const params = {
            TableName: process.env.PROPERTY_TABLE,
            Item: existing,
        };

        return this.client.put(params).promise();
    }

    private prepareItem(item: any): any {
        for (const prop in item) {
            if (Object.prototype.hasOwnProperty.call(item, prop)) {
                if (item[prop] === '') {
                    item[prop] = '---empty---';
                } else if (typeof item[prop] === 'object') {
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
                } else if (typeof item[prop] === 'object') {
                    this.cleanItem(item[prop]);
                }
            }
        }
        return item;
    }



    async getItemById(id: string): Promise<Property> {
        const params: any = {
            TableName: process.env.PROPERTY_TABLE,
            KeyConditionExpression: 'id= :id',
            ExpressionAttributeValues: {
                ':id': id,
            },
        };

        const dbResponse = await this.client.query(params).promise();
        if (dbResponse.Items.length === 0) {
            return null;
        }
        return dbResponse.Items[0] as Property;
    }

    async getItemByURL(url: string): Promise<Property> {
        const params: any = {
            TableName: process.env.PROPERTY_TABLE,
            KeyConditionExpression: 'url= :url',
            ExpressionAttributeValues: {
                ':url': url,
            },
        };

        const dbResponse = await this.client.query(params).promise();
        if (dbResponse.Items.length === 0) {
            return null;
        }
        return dbResponse.Items[0] as Property;
    }
}