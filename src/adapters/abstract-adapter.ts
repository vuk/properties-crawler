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
    parseData(entry: any): any {
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
    abstract store(entry: any): Promise<any>;
}