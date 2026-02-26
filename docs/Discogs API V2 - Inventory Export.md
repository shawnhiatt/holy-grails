[discogs.com](https://www.discogs.com/developers/#page:inventory-export)

# Inventory Export - Discogs API Documentation

---

## Export your inventory [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Ainventory-export#page:inventory-export,header:inventory-export-export-your-inventory)

`/inventory/export`

Request an export of your inventory as a CSV.

- **Response  `200`**
- ##### Headers
    
    ```
    Content-Type: application/jsonLocation: https://api.discogs.com/inventory/export/599632
    ```
    
- **Response  `401`**
- ##### Headers
    
    ```
    Content-Type: application/json
    ```
    
- **Response  `409`**
- ##### Headers
    
    ```
    Content-Type: application/json
    ```
    

## Get recent exports [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Ainventory-export#page:inventory-export,header:inventory-export-get-recent-exports)

`/inventory/export`

Get a list of all recent exports of your inventory. Accepts [Pagination parameters](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Ainventory-export#page:home,header:home-pagination).

- **Response  `200`**
- ##### Headers
    
    ```
    Content-Type: application/json
    ```
    
    ##### Body
    
    ```
    {
      "items": [
        {
          "status": "success",
          "created_ts": "2018-09-27T12:59:02",
          "url": "https://api.discogs.com/inventory/export/599632",
          "finished_ts": "2018-09-27T12:59:02",
          "download_url": "https://api.discogs.com/inventory/export/599632/download",
          "filename": "cburmeister-inventory-20180927-1259.csv",
          "id": 599632
        }
      ],
      "pagination": {
        "per_page": 50,
        "items": 15,
        "page": 1,
        "urls": {},
        "pages": 1
      }
    }
    ```
    
- **Response  `401`**
- ##### Headers
    
    ```
    Content-Type: application/json
    ```
    

## Get an export [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Ainventory-export#page:inventory-export,header:inventory-export-get-an-export)

`/inventory/export/{id}`

Get details about the status of an inventory export.

- **Parameters**
- id
    
    `number` (required) 
    
    Id of the export.
    

- **Request**
- ##### Headers
    
    ```
    Content-Type: multipart/form-dataIf-Modified-Since: Thu, 27 Sep 2018 12:50:39 GMT
    ```
    
- **Response  `200`**
- ##### Headers
    
    ```
    Content-Type: application/jsonLast-Modified: Thu, 27 Sep 2018 12:59:02 GMT
    ```
    
    ##### Body
    
    ```
    {
      "status": "success",
      "created_ts": "2018-09-27T12:50:39",
      "url": "https://api.discogs.com/inventory/export/599632",
      "finished_ts": "2018-09-27T12:59:02",
      "download_url": "https://api.discogs.com/inventory/export/599632/download",
      "filename": "cburmeister-inventory-20180927-1259.csv",
      "id": 599632
    }
    ```
    
- **Response  `304`**
- **Response  `401`**
- ##### Headers
    
    ```
    Content-Type: application/json
    ```
    
- **Response  `404`**
- ##### Headers
    
    ```
    Content-Type: application/json
    ```
    

## Download an export [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Ainventory-export#page:inventory-export,header:inventory-export-download-an-export)

`/inventory/export/{id}/download`

Download the results of an inventory export.

- **Parameters**
- id
    
    `number` (required) 
    
    Id of the export.
    

- **Response  `200`**
- ##### Headers
    
    ```
    Content-Type: text/csv; charset=utf-8Content-Disposition: attachment; filename=cburmeister-inventory-20180927-1259.csv
    ```
    
- **Response  `401`**
- ##### Headers
    
    ```
    Content-Type: application/json
    ```
    
- **Response  `404`**
- ##### Headers
    
    ```
    Content-Type: application/json
    ```