import mongoose from 'mongoose';

export class Database {
    private static instance: Database;
    private constructor() {

    }

    public static getInstance(): Database {
        if (!this.instance) {
            this.instance = new Database();
        }
        return this.instance;
    }

    public async connect(): Promise<any> {
        return await mongoose.connect('mongodb://' + process.env.MONGO_USER + ':' + process.env.MONGO_PASSWORD + '@' + process.env.MONGO_HOST + ':' + process.env.MONGO_PORT + '/' + process.env.MONGO_DB,
            {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                dbName: process.env.MONGO_DB,
                keepAlive: true
            });
    }
}

export const PropertyModel = mongoose.model('Property', new mongoose.Schema({
    url: String,
    title: String,
    description: String,
    area: Number,
    floor: Number,
    floors: Number,
    rooms: Number,
    price: Number,
    unitPrice: Number,
    image: String,
    serviceType: Number,
    type: Number
}));