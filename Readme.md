# Properties crawler

Application is intended to crawl realestate ads from different websites and apply identical filters to all of them collecting fitting ads and send an email 

## Stack

* Database: DynamoDB by Amazon
* Framework: NodeJS
* Backend: Lambda functions (with Serverless)

## Development 

To run database run

``

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
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
PROPERTY_TABLE=
```