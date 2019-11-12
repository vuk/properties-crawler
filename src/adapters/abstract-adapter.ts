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
        return this.getRooms(entry) >= 2 &&
            this.getFloor(entry) >= 1 &&
            this.getFloors(entry) !== this.getFloor(entry) &&
            this.getPrice(entry) < 100000;
    }
    abstract store(entry: any): Promise<any>;
}