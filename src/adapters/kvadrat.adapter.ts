import {AbstractAdapter} from "./abstract-adapter";

export class KvadratAdapter extends AbstractAdapter {
    baseUrl: string = 'http://www.kvadratnekretnine.com/';
    seedUrl: string[] = ['http://www.kvadratnekretnine.com/sr/nekretnine/prodaja/'];

    isType(url: string): any {
        if (url.indexOf(this.baseUrl) !== -1) {
            return this instanceof KvadratAdapter;
        }
        return false;
    }

    getArea(entry: any): number {
        return 0;
    }

    getDescription(entry: any): string {
        return "";
    }

    getFloor(entry: any): number {
        return 0;
    }

    getFloors(entry: any): number {
        return 0;
    }

    getImage(entry: any): string {
        return "";
    }

    getPrice(entry: any): number {
        return 0;
    }

    getRooms(entry: any): number {
        return 0;
    }

    getTitle(entry: any): string {
        return "";
    }

    getUnitPrice(entry: any): number {
        return 0;
    }

    getUrl(entry: any): string {
        return "";
    }

    validateLink(url: string): boolean {
        return url.indexOf(this.baseUrl) !== -1 && (url.indexOf('/sr/listing/') !== -1 || url.indexOf('sr/nekretnine/prodaja/') !== -1);
    }
}