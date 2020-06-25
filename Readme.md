# Properties crawler

Application is intended to crawl realestate ads from different websites and apply identical filters to all of them collecting fitting ads and sendin an email 

## Stack

* Database: DynamoDB by Amazon
* Framework: NodeJS

## Development 

Run docker compose 

`$ docker compose up`

## Environment

```
MIN_ROOMS=1
MAX_ROOMS=10
MIN_AREA=10
MAX_AREA=1000
MIN_FLOOR=0
MAX_FLOOR=40
MIN_PRICE=1000
MAX_PRICE=10000000
NO_ATTIC=true
NO_BASEMENT=true
AWS_ACCESS_KEY_ID=AKIAZDWBTDP7HW7DNS7Z
AWS_SECRET_ACCESS_KEY=BvAdsk1bPdzJjfdxE5n504WENY3gIXBVzC7oGVJb
MONGO_PASSWORD=example
MONGO_DB=properties
MONGO_PORT=27017
MONGO_USER=root
MONGO_HOST=mongo
```