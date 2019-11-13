export abstract class AbstractAdapter {
    abstract baseUrl: string;
    abstract seedUrl: string[];
    abstract isType(url: string): boolean;
    abstract getRooms(entry: any): number;
    abstract getArea(entry: any): number;
    abstract getFloor(entry: any): number;
    abstract getFloors(entry: any): number;
    abstract getPrice(entry: any): number;
    abstract getUnitPrice(entry: any): number;
    abstract getImage(entry: any): string;
    abstract getTitle(entry: any): string;
    abstract getDescription(entry: any): string;
    abstract getUrl(entry: any): string;
    abstract validateLink(url: string): boolean;
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
    abstract store(entry: any): Promise<any>;
}