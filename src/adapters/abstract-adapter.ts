import dotenv from "dotenv";
import * as Joi from '@hapi/joi';
import { Database } from "../utils/db";

dotenv.config();

export enum PropertyType {
    APARTMENT,
    HOUSE,
}

export enum ServiceType {
    SALE,
    RENT,
    EXCHANGE,
}

export interface Property {
    url: string,
    title: string,
    type: PropertyType,
    serviceType: ServiceType,
    description: string,
    area: number,
    floor: number,
    floors: number,
    rooms: number,
    price: number,
    unitPrice: number,
    image: string,
    oldPrice?: number
}

export abstract class AbstractAdapter {
    abstract baseUrl: string;
    abstract seedUrl: string[];
    private validationSchema = Joi.object()
        .keys({
            url: Joi.string().required(),
            type: Joi.number().required(),
            serviceType: Joi.number().required(),
            title: Joi.string().required(),
            description: Joi.string(),
            area: Joi.number().required(),
            floor: Joi.number().required(),
            floors: Joi.number().required(),
            rooms: Joi.number().required(),
            price: Joi.number().required(),
            unitPrice: Joi.number().required(),
            image: Joi.string()
        }).unknown(true);

    abstract isType(url: string): AbstractAdapter;

    abstract getRooms(entry: any): number;

    abstract getArea(entry: any): number;

    abstract getFloor(entry: any): number;

    abstract getFloors(entry: any): number;

    abstract getPrice(entry: any): number;

    getUnitPrice(entry: any): number {
        return this.getPrice(entry) / this.getArea(entry);
    }

    abstract getImage(entry: any): string;

    abstract getTitle(entry: any): string;

    abstract getDescription(entry: any): string;

    abstract getServiceType(entry: any): ServiceType;

    abstract getType(entry: any): PropertyType;

    getUrl(entry: any): string {
        return entry.request.uri.href;
    }

    abstract validateLink(url: string): boolean;

    abstract validateListing(url: string): boolean;

    shouldReturn(entry: any): boolean {
        if (process.env.NO_ATTIC && this.getFloors(entry) === this.getFloor(entry)) {
            return false;
        }
        if (process.env.NO_BASEMENT && this.getFloor(entry) === 0) {
            return false;
        }
        return this.getRooms(entry) >= parseInt(process.env.MIN_ROOMS) &&
            this.getRooms(entry) <= parseInt(process.env.MAX_ROOMS) &&
            this.getFloor(entry) >= parseInt(process.env.MIN_FLOOR) &&
            this.getFloor(entry) <= parseInt(process.env.MAX_FLOOR) &&
            this.getPrice(entry) <= parseInt(process.env.MAX_PRICE) &&
            this.getPrice(entry) >= parseInt(process.env.MIN_PRICE) &&
            this.getArea(entry) >= parseInt(process.env.MIN_AREA) &&
            this.getArea(entry) <= parseInt(process.env.MAX_AREA);
    }

    async parseData(entry: any): Promise<Property> {
        const property: Property = {
            url: this.getUrl(entry),
            title: this.getTitle(entry),
            description: this.getDescription(entry),
            area: this.getArea(entry),
            floor: this.getFloor(entry),
            floors: this.getFloors(entry),
            rooms: this.getRooms(entry),
            price: this.getPrice(entry),
            unitPrice: this.getUnitPrice(entry),
            image: this.getImage(entry),
            type: this.getType(entry),
            serviceType: this.getServiceType(entry),
        };

        await this.validationSchema.validateAsync(property);
        return property;
    }

    async store(property: Property): Promise<any> {
        let db = Database.getInstance();
        await db.putProperty(property);
    }
}