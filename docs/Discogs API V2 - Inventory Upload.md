[discogs.com](https://www.discogs.com/developers/#page:inventory-upload)

# Inventory Upload - Discogs API Documentation

---

## Add inventory [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Ainventory-upload#page:inventory-upload,header:inventory-upload-add-inventory)

`/inventory/upload/add`

Upload a CSV of listings to add to your inventory.

The file you upload must be a comma-separated CSV. The first row must be a header with lower case field names.

Here’s an example:

```
release_id,price,media_condition,comments
123,1.50,Mint (M),Comments about this release for sale
456,2.50,Near Mint (NM or M-),More comments
7890,3.50,Good (G),Signed vinyl copy
```

These listings will be marked “For Sale” immediately. Currency information will be pulled from your marketplace settings. Any fields that aren’t optional or required will be ignored.

- `release_id` - Must be a number. This value corresponds with the Discogs database Release ID.
    
- `price` - Must be a number.
    
- `media_condition` - Must be a valid condition (see below).
    

- `sleeve_condition` - Must be a valid condition (see below).
    
- `comments` `accept_offer` - Must be Y or N.
    
- `location` - Private free-text field to help identify an item’s physical location.
    
- `external_id` - Private notes or IDs for your own reference.
    
- `weight` - In grams. Must be a non-negative integer.
    
- `format_quantity` - Number of items that this item counts as (for shipping).
    

When you specify a media condition, it must exactly match one of these:

- `Mint (M)`
    
- `Near Mint (NM or M-)`
    
- `Very Good Plus (VG+)`
    
- `Very Good (VG)`
    
- `Good Plus (G+)`
    
- `Good (G)`
    
- `Fair (F)`
    
- `Poor (P)`
    

Sleeve condition may be any of the above, or:

- `Not Graded`
    
- `Generic`
    
- `No Cover`
    

- **Parameters**
- upload
    
    `file` (required) 
    
    The CSV file of items to add to your inventory.
    

- **Response  `200`**
- ##### Headers
    
    ```
    Content-Type: application/jsonLocation: https://api.discogs.com/inventory/upload/599632
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
    
- **Response  `415`**
- ##### Headers
    
    ```
    Content-Type: application/json
    ```
    
- **Response  `422`**
- ##### Headers
    
    ```
    Content-Type: application/json
    ```
    

## Change inventory [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Ainventory-upload#page:inventory-upload,header:inventory-upload-change-inventory)

`/inventory/upload/change`

Upload a CSV of listings to change in your inventory.

The file you upload must be a comma-separated CSV. The first row must be a header with lower case field names.

Here’s an example:

```
release_id,price,media_condition,comments
123,1.50,Mint (M),Comments about this release for sale
456,2.50,Near Mint (NM or M-),More comments
7890,3.50,Good (G),Signed vinyl copy
```

These listings will be marked “For Sale” immediately. Currency information will be pulled from your marketplace settings. Any fields that aren’t optional or required will be ignored.

- `release_id` - Must be a number. This value corresponds with the Discogs database Release ID.

- `price` -
    
- `media_condition` - Must be a valid condition (see below).
    
- `sleeve_condition` - Must be a valid condition (see below).
    
- `comments`
    
- `accept_offer` - Must be Y or N.
    
- `external_id` - Private notes or IDs for your own reference.
    
- `location` - Private free-text field to help identify an item’s physical location.
    
- `weight` - In grams. Must be a non-negative integer.
    
- `format_quantity` - Number of items that this item counts as (for shipping).
    

When you specify a media condition, it must exactly match one of these:

- `Mint (M)`
    
- `Near Mint (NM or M-)`
    
- `Very Good Plus (VG+)`
    
- `Very Good (VG)`
    
- `Good Plus (G+)`
    
- `Good (G)`
    
- `Fair (F)`
    
- `Poor (P)`
    

Sleeve condition may be any of the above, or:

- `Not Graded`
    
- `Generic`
    
- `No Cover`
    

- **Parameters**
- upload
    
    `file` (required) 
    
    The CSV file of items to alter in your inventory.
    

- **Response  `200`**
- ##### Headers
    
    ```
    Content-Type: application/jsonLocation: https://api.discogs.com/inventory/upload/599632
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
    
- **Response  `415`**
- ##### Headers
    
    ```
    Content-Type: application/json
    ```
    
- **Response  `422`**
- ##### Headers
    
    ```
    Content-Type: application/json
    ```
    

## Delete inventory [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Ainventory-upload#page:inventory-upload,header:inventory-upload-delete-inventory)

`/inventory/upload/delete`

Upload a CSV of listings to delete from your inventory.

The file you upload must be a comma-separated CSV. The first row must be a header with lower case field names.

Here’s an example:

```
listing_id
12345678
98765432
31415926
```

- `listing_id` - Must be a number. This is the ID of the listing you wish to delete.

- **Parameters**
- upload
    
    `file` (required) 
    
    The CSV file listing items to remove from your inventory.
    

- **Response  `200`**
- ##### Headers
    
    ```
    Content-Type: application/jsonLocation: https://api.discogs.com/inventory/upload/599632
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
    
- **Response  `415`**
- ##### Headers
    
    ```
    Content-Type: application/json
    ```
    
- **Response  `422`**
- ##### Headers
    
    ```
    Content-Type: application/json
    ```
    

## Get recent uploads [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Ainventory-upload#page:inventory-upload,header:inventory-upload-get-recent-uploads)

`/inventory/upload`

Get a list of all recent inventory uploads. Accepts [Pagination parameters](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Ainventory-upload#page:home,header:home-pagination).

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
          "results": "CSV file contains 1 records.<p>Processed 1 records.",
          "created_ts": "2017-12-18T09:20:28",
          "finished_ts": "2017-12-18T09:20:29",
          "filename": "add.csv",
          "type": "change",
          "id": 119615
        }
      ],
      "pagination": {
        "per_page": 50,
        "items": 1,
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
    

## Get an upload [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Ainventory-upload#page:inventory-upload,header:inventory-upload-get-an-upload)

`/inventory/upload/{id}`

Get details about the status of an inventory upload.

- **Parameters**
- id
    
    `number` (required) 
    
    Id of the export.
    

- **Request**
- ##### Headers
    
    ```
    Content-Type: multipart/form-dataIf-Modified-Since: Thu, 27 Sep 2018 09:20:28 GMT
    ```
    
- **Response  `200`**
- ##### Headers
    
    ```
    Content-Type: application/json
    ```
    
    ##### Body
    
    ```
    {
      "status": "success",
      "results": "CSV file contains 1 records.<p>Processed 1 records.",
      "created_ts": "2017-12-18T09:20:28",
      "finished_ts": "2017-12-18T09:20:29",
      "filename": "add.csv",
      "type": "change",
      "id": 119615
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