const mysql = require('mysql');
require('dotenv').config();

export interface Property {
    url: string,
    title: string,
    description: string,
    area: number,
    floor: number,
    floors: number,
    rooms: number,
    price: number,
    unitPrice: number,
    image: string
}

const connection = mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB
});

export abstract class AbstractAdapter {
    abstract baseUrl: string;
    abstract seedUrl: string[];

    abstract isType(url: string): boolean;

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

    parseData(entry: any): Property {
        return {
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
        }
    }

    store(property: Property): Promise<any> {
        return new Promise((resolve, reject) => {
            connection.connect();
            console.log('Storing property', property);
            connection.query(`INSERT INTO properties(url, image, floor, floors, title, description, price, unitPrice, rooms, area, user_id) 
                VALUES (${property.url}, ${property.image}, ${property.floor}, ${property.floors}, ${property.title}, ${property.description}, ${property.price}, ${property.unitPrice}, ${property.rooms}, ${property.area}, 0)`,
                function (error: any, results: any, fields: any) {
                    connection.end();
                    if (error) reject(error);
                    console.log('Saved to database: ', results, property);
                    resolve(results);
                });

        });
    }
}