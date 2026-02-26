[discogs.com](https://www.discogs.com/developers/#page:marketplace)

# Marketplace - Discogs API Documentation

---

## Inventory [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Amarketplace#page:marketplace,header:marketplace-inventory)

Returns the list of listings in a user’s inventory. Accepts [Pagination parameters](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Amarketplace#page:home,header:home-pagination).  
Basic information about each listing and the corresponding release is provided, suitable for display in a list. For detailed information about the release, make another API call to fetch the corresponding Release.

If you are not authenticated as the inventory owner, only items that have a status of For Sale will be visible.  
If you are authenticated as the inventory owner you will get additional `weight`, `format_quantity`, `external_id`, `location`, and `quantity` keys. Note that `quantity` is a read-only field for NearMint users, who will see `1` for all quantity values, regardless of their actual count. If the user is authorized, the listing will contain a in_cart boolean field indicating whether or not this listing is in their cart.

`/users/{username}/inventory{?status,sort,sort_order}`

Get a seller’s inventory

- **Parameters**
- username
    
    `string` (required) **Example:** 360vinyl
    
    The username for whose inventory you are fetching
    
    status
    
    `string` (optional) **Example:** for sale
    
    Only show items with this status.
    
    sort
    
    `string` (optional) **Example:** price
    
    Sort items by this field:  
    `listed`  
    `price`  
    `item` (i.e. the title of the release)  
    `artist`  
    `label`  
    `catno`  
    `audio`  
    `status` (when authenticated as the inventory owner)  
    `location` (when authenticated as the inventory owner)
    
    sort_order
    
    `string` (optional) **Example:** asc
    
    Sort items in a particular order (one of `asc`, `desc`)
    

- **Response  `200`**
- Headers
    
    ```
    Status: HTTP/1.1 200 OKReproxy-Status: yesAccess-Control-Allow-Origin: *Cache-Control: public, must-revalidateContent-Type: application/jsonLink: <https://api.discogs.com/users/360vinyl/inventory?per_page=50&page=18>; rel="last", <https://api.discogs.com/users/360vinyl/inventory?per_page=50&page=2>; rel="next"Server: lighttpdContent-Length: 36813Date: Tue, 15 Jul 2014 18:53:23 GMTX-Varnish: 1701983958Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "pagination": {
        "per_page": 50,
        "items": 4,
        "page": 1,
        "urls": {},
        "pages": 1
      },
      "listings": [
        {
          "status": "For Sale",
          "price": {
            "currency": "USD",
            "value": 149.99
          },
          "allow_offers": true,
          "sleeve_condition": "Near Mint (NM or M-)",
          "id": 150899904,
          "condition": "Near Mint (NM or M-)",
          "posted": "2014-07-01T10:20:17-07:00",
          "ships_from": "United States",
          "uri": "https://www.discogs.com/sell/item/150899904",
          "comments": "Includes promotional booklet from original purchase!",
          "seller": {
            "username": "rappcats",
            "resource_url": "https://api.discogs.com/users/rappcats",
            "id": 2098225
          },
          "release": {
            "catalog_number": "509990292346, TMR092",
            "resource_url": "https://api.discogs.com/releases/2992668",
            "year": 2011,
            "id": 2992668,
            "description": "Danger Mouse & Daniele Luppi - Rome (LP, Ora + LP, Whi + Album, Ltd, Tip)",
            "artist": "Danger Mouse & Daniele Luppi",
            "title": "Rome",
            "format": "(LP, Ora + LP, Whi + Album, Ltd, Tip)",
            "thumbnail": "https://api-img.discogs.com/CFEw018vfc3LvUQDFtsvkh9FTyA=/fit-in/322x320/filters:strip_icc():format(jpeg):mode_rgb():quality(40)/discogs-images/R-2992668-1310811542.jpeg.jpg"
          },
          "resource_url": "https://api.discogs.com/marketplace/listings/150899904",
          "audio": false
        },
        {
          "status": "For Sale",
          "price": {
            "currency": "USD",
            "value": 49.99
          },
          "allow_offers": false,
          "sleeve_condition": "Very Good Plus (VG+)",
          "id": 155473349,
          "condition": "Very Good Plus (VG+)",
          "posted": "2014-07-01T10:20:17-07:00",
          "ships_from": "United States",
          "uri": "https://www.discogs.com/sell/item/155473349",
          "comments": "Includes slipmats",
          "seller": {
            "username": "rappcats",
            "resource_url": "https://api.discogs.com/users/rappcats",
            "id": 2098225
          },
          "release": {
            "catalog_number": "STH 2222",
            "resource_url": "https://api.discogs.com/releases/1900152",
            "year": 2009,
            "id": 1900152,
            "description": "Various - Stones Throw X Serato (2x12\", Ltd, Cle)",
            "thumbnail": "https://api-img.discogs.com/BfviIBw5nZOA2BHd0xn8Vfu1X_g=/fit-in/600x600/filters:strip_icc():format(jpeg):mode_rgb():quality(40)/discogs-images/R-1900152-1315429257.jpeg.jpg"
          },
          "resource_url": "https://api.discogs.com/marketplace/listings/155473349",
          "audio": false
        },
        {
          "status": "For Sale",
          "price": {
            "currency": "USD",
            "value": 39.99
          },
          "allow_offers": true,
          "sleeve_condition": "Near Mint (NM or M-)",
          "id": 150899171,
          "condition": "Very Good Plus (VG+)",
          "posted": "2014-07-07T11:40:08-07:00",
          "ships_from": "United States",
          "uri": "https://www.discogs.com/sell/item/150899171",
          "comments": "",
          "seller": {
            "username": "rappcats",
            "resource_url": "https://api.discogs.com/users/rappcats",
            "id": 2098225
          },
          "release": {
            "catalog_number": "STH 2172",
            "resource_url": "https://api.discogs.com/releases/1842118",
            "year": 2009,
            "id": 1842118,
            "description": "Last Electro-Acoustic Space Jazz & Percussion Ensemble, The - Summer Suite (CD, MiniAlbum, Ltd)",
            "thumbnail": "https://api-img.discogs.com/pm6PIqf4vEK8S8rCkySA9eKNFgk=/fit-in/455x455/filters:strip_icc():format(jpeg):mode_rgb():quality(40)/discogs-images/R-1842118-1247162514.jpeg.jpg"
          },
          "resource_url": "https://api.discogs.com/marketplace/listings/150899171",
          "audio": false
        },
        {
          "status": "For Sale",
          "price": {
            "currency": "USD",
            "value": 229.99
          },
          "allow_offers": false,
          "sleeve_condition": "Near Mint (NM or M-)",
          "id": 171931719,
          "condition": "Near Mint (NM or M-)",
          "posted": "2014-07-12T16:23:14-07:00",
          "ships_from": "United States",
          "uri": "https://www.discogs.com/sell/item/171931719",
          "comments": "Includes poster, includes download card, includes 7\", in original bag w/ hype sticker. Complete set!",
          "seller": {
            "username": "rappcats",
            "resource_url": "https://api.discogs.com/users/rappcats",
            "id": 2098225
          },
          "release": {
            "catalog_number": "NSD-120",
            "resource_url": "https://api.discogs.com/releases/2791275",
            "year": 2011,
            "id": 2791275,
            "description": "Metal Fingers - Presents Special Herbs The Box Set Vol. 0-9 (Box, Comp, Ltd + 10xLP + 7\")",
            "thumbnail": "https://api-img.discogs.com/wyy8_nChnz_ergzK9gd4wxqr-K0=/fit-in/600x600/filters:strip_icc():format(jpeg):mode_rgb():quality(40)/discogs-images/R-2791275-1301188174.jpeg.jpg"
          },
          "resource_url": "https://api.discogs.com/marketplace/listings/171931719",
          "audio": false
        }
      ]
    }
    ```
    
- **Response  `404`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 404 Not FoundReproxy-Status: yesAccess-Control-Allow-Origin: *Content-Type: application/jsonServer: lighttpdContent-Length: 33Date: Tue, 01 Jul 2014 01:03:20 GMTX-Varnish: 1465521729Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "message": "The request resource was not found."
    }
    ```
    
- **Response  `422`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 422 Unprocessable EntityReproxy-Status: yesAccess-Control-Allow-Origin: *Cache-Control: public, must-revalidateContent-Type: application/jsonServer: lighttpdContent-Length: 114Date: Tue, 15 Jul 2014 19:16:59 GMTX-Varnish: 1702310957Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "message": "Invalid status: expected one of All, Deleted, Draft, Expired, For Sale, Sold, Suspended, Violation."
    }
    ```
    

## Listing [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Amarketplace#page:marketplace,header:marketplace-listing)

View the data associated with a listing.  
If the authorized user is the listing owner the listing will include the `weight`, `format_quantity`, `external_id`, `location`, and `quantity` keys. Note that `quantity` is a read-only field for NearMint users, who will see `1` for all quantity values, regardless of their actual count. If the user is authorized, the listing will contain a in_cart boolean field indicating whether or not this listing is in their cart.

`/marketplace/listings/{listing_id}{?curr_abbr}`

The Listing resource allows you to view Marketplace listings.

- **Parameters**
- listing_id
    
    `number` (required) **Example:** 172723812
    
    The ID of the listing you are fetching
    
    curr_abbr
    
    `string` (optional) **Example:** USD
    
    Currency for marketplace data. Defaults to the authenticated users currency. Must be one of the following:  
    `USD` `GBP` `EUR` `CAD` `AUD` `JPY` `CHF` `MXN` `BRL` `NZD` `SEK` `ZAR`
    

- **Response  `200`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 200 OKReproxy-Status: yesAccess-Control-Allow-Origin: *Cache-Control: public, must-revalidateContent-Type: application/jsonServer: lighttpdContent-Length: 780Date: Tue, 15 Jul 2014 19:59:59 GMTX-Varnish: 1702965334Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "status": "For Sale",
      "price": {
        "currency": "USD",
        "value": 120
      },
      "original_price": {
        "curr_abbr": "USD",
        "curr_id": 1,
        "formatted": "$120.00",
        "value": 120.0
      },
      "allow_offers": false,
      "sleeve_condition": "Mint (M)",
      "id": 172723812,
      "condition": "Mint (M)",
      "posted": "2014-07-15T12:55:01-07:00",
      "ships_from": "United States",
      "uri": "https://www.discogs.com/sell/item/172723812",
      "comments": "Brand new... Still sealed!",
      "seller": {
        "username": "Booms528",
        "avatar_url": "https://secure.gravatar.com/avatar/8aa676fcfa2be14266d0ccad88da2cc4?s=500&r=pg&d=mm",
        "resource_url": "https://api.discogs.com/users/Booms528",
        "url": "https://api.discogs.com/users/Booms528",
        "id": 1369620
        "shipping": "Buyer responsible for shipping. Price depends on distance but is usually $5-10.",
        "payment": "PayPal",
        "stats": {
          "rating": "100",
          "stars": 5.0,
          "total": 15
        }
      },
      "shipping_price": {
        "currency": "USD",
        "value": 2.50
      },
      "original_shipping_price": {
        "curr_abbr": "USD",
        "curr_id": 1,
        "formatted": "$2.50",
        "value": 2.5
      },
      "release": {
        "catalog_number": "541125-1, 1-541125 (K1)",
        "resource_url": "https://api.discogs.com/releases/5610049",
        "year": 2014,
        "id": 5610049,
        "description": "LCD Soundsystem - The Long Goodbye: LCD Soundsystem Live At Madison Square Garden (5xLP + Box)",
        "thumbnail": "https://api-img.discogs.com/UsvcarhmrXb0km4QH_dRP8gEf3E=/fit-in/600x600/filters:strip_icc():format(jpeg):mode_rgb():quality(40)/discogs-images/R-5610049-1399500556-9283.jpeg.jpg"
      },
      "resource_url": "https://api.discogs.com/marketplace/listings/172723812",
      "audio": false
    }
    ```
    
- **Response  `404`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 404 Not FoundReproxy-Status: yesAccess-Control-Allow-Origin: *Content-Type: application/jsonServer: lighttpdContent-Length: 33Date: Tue, 01 Jul 2014 01:03:20 GMTX-Varnish: 1465521729Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "message": "The request resource was not found."
    }
    ```
    

`/marketplace/listings/{listing_id}{?curr_abbr}`

Edit the data associated with a listing.

If the listing’s status is not `For Sale`, `Draft`, or `Expired`, it cannot be modified – only deleted. To re-list a Sold listing, a new listing must be created.

[Authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Amarketplace#page:authentication) as the listing owner is required.

- **Parameters**
- listing_id
    
    `number` (required) **Example:** 172723812
    
    The ID of the listing you are fetching
    
    release_id
    
    `number` (required) **Example:** 1
    
    The ID of the release you are posting
    
    condition
    
    `string` (required) **Example:** Mint
    
    The condition of the release you are posting. Must be one of the following:  
    `Mint (M)`  
    `Near Mint (NM or M-)`  
    `Very Good Plus (VG+)`  
    `Very Good (VG)`  
    `Good Plus (G+)`  
    `Good (G)`  
    `Fair (F)`  
    `Poor (P)`
    
    sleeve_condition
    
    `string` (optional) **Example:** Fair
    
    The condition of the sleeve of the item you are posting. Must be one of the following:  
    `Mint (M)`  
    `Near Mint (NM or M-)`  
    `Very Good Plus (VG+)`  
    `Very Good (VG)`  
    `Good Plus (G+)`  
    `Good (G)`  
    `Fair (F)`  
    `Poor (P)`  
    `Generic` `Not Graded` `No Cover`
    
    price
    
    `number` (required) **Example:** 10.00
    
    The price of the item (in the seller’s currency).
    
    comments
    
    `string` (optional) **Example:** This item is wonderful
    
    Any remarks about the item that will be displayed to buyers.
    
    allow_offers
    
    `boolean` (optional) **Example:** true
    
    Whether or not to allow buyers to make offers on the item. Defaults to `false`.
    
    status
    
    `string` (required) **Example:** Draft
    
    The status of the listing. Defaults to `For Sale`. Options are `For Sale` (the listing is ready to be shown on the Marketplace) and `Draft` (the listing is not ready for public display).
    
    external_id
    
    `string` (optional) **Example:** 10.00
    
    A freeform field that can be used for the seller’s own reference. Information stored here will not be displayed to anyone other than the seller. This field is called “Private Comments” on the Discogs website.
    
    location
    
    `string` (optional) **Example:** 10.00
    
    A freeform field that is intended to help identify an item’s physical storage location. Information stored here will not be displayed to anyone other than the seller. This field will be visible on the inventory management page and will be available in inventory exports via the website.
    
    weight
    
    `number` (optional) **Example:** 10.00
    
    The weight, in grams, of this listing, for the purpose of calculating shipping. Set this field to `auto` to have the weight automatically estimated for you.
    
    format_quantity
    
    `number` (optional) **Example:** 10.00
    
    The number of items this listing counts as, for the purpose of calculating shipping. This field is called “Counts As” on the Discogs website. Set this field to `auto` to have the quantity automatically estimated for you.
    

- **Request**
- ##### Headers
    
    ```
    Content-Type: application/json
    ```
    
- **Response  `204`**

`/marketplace/listings/{listing_id}{?curr_abbr}`

Permanently remove a listing from the Marketplace.  
[Authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Amarketplace#page:authentication) as the listing owner is required.

- **Parameters**
- listing_id
    
    `number` (required) **Example:** 172723812
    
    The ID of the listing you are fetching
    

- **Request**
- ##### Headers
    
    ```
    Content-Type: application/json
    ```
    
- **Response  `204`**

## New Listing [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Amarketplace#page:marketplace,header:marketplace-new-listing)

`/marketplace/listings{?release_id,condition,sleeve_condition,price,comments,allow_offers,status,external_id,location,weight,format_quantity}`

Create a Marketplace listing.  
[Authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Amarketplace#page:authentication) is required; the listing will be added to the authenticated user’s Inventory.

- **Parameters**
- release_id
    
    `number` (required) **Example:** 1
    
    The ID of the release you are posting
    
    condition
    
    `string` (required) **Example:** Mint
    
    The condition of the release you are posting. Must be one of the following:  
    `Mint (M)`  
    `Near Mint (NM or M-)`  
    `Very Good Plus (VG+)`  
    `Very Good (VG)`  
    `Good Plus (G+)`  
    `Good (G)`  
    `Fair (F)`  
    `Poor (P)`
    
    sleeve_condition
    
    `string` (optional) **Example:** Fair
    
    The condition of the sleeve of the item you are posting. Must be one of the following:  
    `Mint (M)`  
    `Near Mint (NM or M-)`  
    `Very Good Plus (VG+)`  
    `Very Good (VG)`  
    `Good Plus (G+)`  
    `Good (G)`  
    `Fair (F)`  
    `Poor (P)`  
    `Generic` `Not Graded` `No Cover`
    
    price
    
    `number` (required) **Example:** 10.00
    
    The price of the item (in the seller’s currency).
    
    comments
    
    `string` (optional) **Example:** This item is wonderful
    
    Any remarks about the item that will be displayed to buyers.
    
    allow_offers
    
    `boolean` (optional) **Example:** true
    
    Whether or not to allow buyers to make offers on the item. Defaults to `false`.
    
    status
    
    `string` (required) **Example:** Draft
    
    The status of the listing. Defaults to `For Sale`. Options are `For Sale` (the listing is ready to be shown on the Marketplace) and `Draft` (the listing is not ready for public display).
    
    external_id
    
    `string` (optional) **Example:** 10.00
    
    A freeform field that can be used for the seller’s own reference. Information stored here will not be displayed to anyone other than the seller. This field is called “Private Comments” on the Discogs website.
    
    location
    
    `string` (optional) **Example:** 10.00
    
    A freeform field that is intended to help identify an item’s physical storage location. Information stored here will not be displayed to anyone other than the seller. This field will be visible on the inventory management page and will be available in inventory exports via the website.
    
    weight
    
    `number` (optional) **Example:** 10.00
    
    The weight, in grams, of this listing, for the purpose of calculating shipping. Set this field to `auto` to have the weight automatically estimated for you.
    
    format_quantity
    
    `number` (optional) **Example:** 10.00
    
    The number of items this listing counts as, for the purpose of calculating shipping. This field is called “Counts As” on the Discogs website. Set this field to `auto` to have the quantity automatically estimated for you.
    

- **Request**
- ##### Headers
    
    ```
    Content-Type: application/json
    ```
    
- **Response  `201`**
- ##### Body
    
    ```
    {
      "listing_id": 41578241,
      "resource_url": "https://api.discogs.com/marketplace/listings/41578241"
    }
    ```
    
- **Response  `403`**
- ##### Body
    
    ```
    {
      "message": "You don't have permission to access this resource."
    }
    ```
    

## Order [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Amarketplace#page:marketplace,header:marketplace-order)

The Order resource allows you to manage a seller’s Marketplace orders.

`/marketplace/orders/{order_id}`

View the data associated with an order.  
[Authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Amarketplace#page:authentication) as the seller is required.

- **Parameters**
- order_id
    
    `number` (required) **Example:** 1-1
    
    The ID of the order you are fetching
    

- **Response  `200`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 200 OKReproxy-Status: yesAccess-Control-Allow-Origin: *Cache-Control: public, must-revalidateContent-Type: application/jsonServer: lighttpdContent-Length: 780Date: Tue, 15 Jul 2014 19:59:59 GMTX-Varnish: 1702965334Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "id": "1-1",
      "resource_url": "https://api.discogs.com/marketplace/orders/1-1",
      "messages_url": "https://api.discogs.com/marketplace/orders/1-1/messages",
      "uri": "https://www.discogs.com/sell/order/1-1",
      "status": "New Order",
      "next_status": [
        "New Order",
        "Buyer Contacted",
        "Invoice Sent",
        "Payment Pending",
        "Payment Received",
        "In Progress",
        "Shipped",
        "Refund Sent",
        "Cancelled (Non-Paying Buyer)",
        "Cancelled (Item Unavailable)",
        "Cancelled (Per Buyer's Request)"
      ],
      "fee": {
        "currency": "USD",
        "value": 2.52
      },
      "created": "2011-10-21T09:25:17-07:00",
      "items": [
        {
          "release": {
            "id": 1,
            "description": "Persuader, The - Stockholm (2x12\")"
          },
          "price": {
            "currency": "USD",
            "value": 42
          },
          "media_condition": "Mint (M)",
          "sleeve_condition": "Mint (M)",
          "id": 41578242
        }
      ],
      "shipping": {
        "currency": "USD",
        "method": "Standard",
        "value": 0
      },
      "shipping_address": "Asdf Exampleton\n234 NE Asdf St.\nAsdf Town, Oregon, 14423\nUnited States\n\nPhone: 555-555-2733\nPaypal address: asdf@example.com",
      "additional_instructions": "please use sturdy packaging.",
      "archived": false,
      "seller": {
        "resource_url": "https://api.discogs.com/users/example_seller",
        "username": "example_seller",
        "id": 1
      },
      "last_activity": "2011-10-21T09:25:17-07:00",
      "buyer": {
        "resource_url": "https://api.discogs.com/users/example_buyer",
        "username": "example_buyer",
        "id": 2
      },
      "total": {
        "currency": "USD",
        "value": 42
      },
      "tracking": {
        "number": "1Z999999999999999",
        "carrier": "UPS",
        "url": "https://www.ups.com/track?tracknum=1Z999999999999999"
      }
    }
    ```
    
- **Response  `401`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 401 UnauthorizedReproxy-Status: yesAccess-Control-Allow-Origin: *Cache-Control: public, must-revalidateContent-Type: application/jsonWWW-Authenticate: OAuth realm="https://api.discogs.com"Server: lighttpdContent-Length: 61Date: Tue, 15 Jul 2014 20:37:49 GMTX-Varnish: 1703540564Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "message": "You must authenticate to access this resource."
    }
    ```
    

`/marketplace/orders/{order_id}`

Edit the data associated with an order.  
[Authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Amarketplace#page:authentication) as the seller is required.  
The response contains a `next_status` key – an array of valid next statuses for this order, which you can display to the user in (for example) a dropdown control. This also renders your application more resilient to any future changes in the order status logic.  
Changing the order status using this resource will always message the buyer with:

`Seller changed status from Old Status to New Status`

and does not provide a facility for including a custom message along with the change. For more fine-grained control, use the Add a new message resource, which allows you to simultaneously add a message and change the order status.  
If the order status is neither cancelled, Payment Received, nor Shipped, you can change the shipping. Doing so will send an invoice to the buyer and set the order status to Invoice Sent. (For that reason, you cannot set the shipping and the order status in the same request.) Sellers can also set tracking information for an order by providing a `tracking` object with a tracking number and optionally a carrier. The tracking URL will be automatically generated based on the carrier.

- **Parameters**
- order_id
    
    `number` (required) **Example:** 1-1
    
    The ID of the order you are fetching
    
    status
    
    `string` (optional) **Example:** New Order
    
    The status of the Order you are updating. Must be one of the following:  
    `New Order`  
    `Buyer Contacted`  
    `Invoice Sent`  
    `Payment Pending`  
    `Payment Received` `In Progress` `Shipped`  
    `Refund Sent`  
    `Cancelled (Non-Paying Buyer)`  
    `Cancelled (Item Unavailable)`  
    `Cancelled (Per Buyer's Request)`  
    the order’s current status
    
    Furthermore, the new status must be present in the order’s next_status list. For more information about order statuses, see Edit an order.
    
    shipping
    
    `number` (optional) **Example:** 5.00
    
    The order shipping amount. As a side-effect of setting this value, the buyer is invoiced and the order status is set to `Invoice Sent`.
    
    tracking
    
    `object` (optional) 
    
    Set tracking information for the order. Only the seller can set tracking information; buyers will receive a `403 Forbidden` response. The tracking object has the following properties:
    
    - `number` (required, string): The tracking number provided by the carrier.
        
    - `carrier` (optional, string): The shipping carrier. Must be one of: `UPS`, `USPS`, `DHL`, `Deutsche Post`, `La Poste`, `Royal Mail`, `PostNL`, `DHL Germany`, `Other`. If not provided, defaults to no carrier specified.
        
    

- **Request**
- ##### Headers
    
    ```
    Content-Type: application/json
    ```
    
- **Response  `200`**
- ##### Body
    
    ```
    {
      "id": "1-1",
      "resource_url": "https://api.discogs.com/marketplace/orders/1-1",
      "messages_url": "https://api.discogs.com/marketplace/orders/1-1/messages",
      "uri": "https://www.discogs.com/sell/order/1-1",
      "status": "Invoice Sent",
      "next_status": [
        "New Order",
        "Buyer Contacted",
        "Invoice Sent",
        "Payment Pending",
        "Payment Received",
        "In Progress",
        "Shipped",
        "Refund Sent",
        "Cancelled (Non-Paying Buyer)",
        "Cancelled (Item Unavailable)",
        "Cancelled (Per Buyer's Request)"
      ],
      "fee": {
        "currency": "USD",
        "value": 2.52
      },
      "created": "2011-10-21T09:25:17-07:00",
      "items": [
        {
          "release": {
            "id": 1,
            "description": "Persuader, The - Stockholm (2x12\")"
          },
          "price": {
            "currency": "USD",
            "value": 42
          },
          "id": 41578242
        }
      ],
      "shipping": {
        "currency": "USD",
        "method": "Standard",
        "value": 5
      },
      "shipping_address": "Asdf Exampleton\n234 NE Asdf St.\nAsdf Town, Oregon, 14423\nUnited States\n\nPhone: 555-555-2733\nPaypal address: asdf@example.com",
      "additional_instructions": "please use sturdy packaging.",
      "archived": false,
      "seller": {
        "resource_url": "https://api.discogs.com/users/example_seller",
        "username": "example_seller",
        "id": 1
      },
      "last_activity": "2011-10-22T19:18:53-07:00",
      "buyer": {
        "resource_url": "https://api.discogs.com/users/example_buyer",
        "username": "example_buyer",
        "id": 2
      },
      "total": {
        "currency": "USD",
        "value": 47
      },
      "tracking": {
        "number": "1Z999999999999999",
        "carrier": "UPS",
        "url": "https://www.ups.com/track?tracknum=1Z999999999999999"
      }
    }
    ```
    
- **Response  `400`**
- ##### Body
    
    ```
    {
      "message": "Tracking number is required."
    }
    ```
    
- **Response  `403`**
- ##### Body
    
    ```
    {
      "message": "Only the seller can set tracking information."
    }
    ```
    

## List Orders [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Amarketplace#page:marketplace,header:marketplace-list-orders)

Returns a list of the authenticated user’s orders. Accepts [Pagination parameters](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Amarketplace#page:home,header:home-pagination).

`/marketplace/orders{?status,created_after,created_before,sort,sort_order}`

Returns a list of the authenticated user’s orders. Accepts [Pagination parameters](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Amarketplace#page:home,header:home-pagination).

- **Parameters**
- status
    
    `string` (optional) **Example:** 1-1
    
    Only show orders with this status. Valid `status` keys are:  
    `All`  
    `New Order`  
    `Buyer Contacted`  
    `Invoice Sent`  
    `Payment Pending`  
    `Payment Received` `In Progress` `Shipped`  
    `Merged`  
    `Order Changed`  
    `Refund Sent`  
    `Cancelled`  
    `Cancelled (Non-Paying Buyer)`  
    `Cancelled (Item Unavailable)`  
    `Cancelled (Per Buyer's Request)` `Cancelled (Refund Received)`
    
    created_after
    
    `string` (optional) **Example:** 2019-06-24T20:58:58Z
    
    Only show orders created after this ISO 8601 timestamp.
    
    created_before
    
    `string` (optional) **Example:** 2019-06-24T20:58:58Z
    
    Only show orders created before this ISO 8601 timestamp.
    
    archived
    
    `boolean` (optional) **Example:** true
    
    Only show orders with a specific archived status. If no key is provided, both statuses are returned. Valid `archived` keys are:  
    `true`  
    `false`
    
    sort
    
    `string` (optional) **Example:** 1-1
    
    Sort items by this field (see below). Valid `sort` keys are:  
    `id`  
    `buyer`  
    `created`  
    `status`  
    `last_activity`
    
    sort_order
    
    `string` (optional) **Example:** 1-1
    
    Sort items in a particular order (one of `asc`, `desc`)
    

- **Response  `200`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 200 OKReproxy-Status: yesAccess-Control-Allow-Origin: *Cache-Control: public, must-revalidateContent-Type: application/jsonServer: lighttpdContent-Length: 780Date: Tue, 15 Jul 2014 19:59:59 GMTX-Varnish: 1702965334Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "pagination": {
        "per_page": 50,
        "pages": 1,
        "page": 1,
        "items": 1,
        "urls": {}
      },
      "orders": [
        {
          "status": "New Order",
          "fee": {
            "currency": "USD",
            "value": 2.52
          },
          "created": "2011-10-21T09:25:17-07:00",
          "items": [
            {
              "release": {
                "id": 1,
                "description": "Persuader, The - Stockholm (2x12\")",
                "resource_url": "https://api.discogs.com/releases/1",
                "thumbnail": "http://api-img.discogs.com/souG2t4I8ZFVK3kHVtD3zjGvd_Y=/fit-in/300x300/filters:strip_icc():format(jpeg):mode_rgb():quality(40)/discogs-images/R-1-1193812031.jpeg.jpg"
              },
              "price": {
                "currency": "USD",
                "value": 42.0
              },
              "id": 41578242
            }
          ],
          "shipping": {
            "currency": "USD",
            "method": "Standard",
            "value": 0.0
          },
          "shipping_address": "Asdf Exampleton\n234 NE Asdf St.\nAsdf Town, Oregon, 14423\nUnited States\n\nPhone: 555-555-2733\nPaypal address: asdf@example.com",
          "additional_instructions": "please use sturdy packaging.",
          "archived": false,
          "seller": {
            "resource_url": "https://api.discogs.com/users/example_seller",
            "username": "example_seller",
            "id": 1
          },
          "last_activity": "2011-10-21T09:25:17-07:00",
          "buyer": {
            "resource_url": "https://api.discogs.com/users/example_buyer",
            "username": "example_buyer",
            "id": 2
          },
          "total": {
            "currency": "USD",
            "value": 42.0
          },
          "id": "1-1"
          "resource_url": "https://api.discogs.com/marketplace/orders/1-1",
          "messages_url": "https://api.discogs.com/marketplace/orders/1-1/messages",
          "uri": "https://www.discogs.com/sell/order/1-1",
          "next_status": [
            "New Order",
            "Buyer Contacted",
            "Invoice Sent",
            "Payment Pending",
            "Payment Received",
            "In Progress",
            "Shipped",
            "Refund Sent",
            "Cancelled (Non-Paying Buyer)",
            "Cancelled (Item Unavailable)",
            "Cancelled (Per Buyer's Request)"
          ]
        }
      ]
    }
    ```
    

## List Order Messages [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Amarketplace#page:marketplace,header:marketplace-list-order-messages)

`/marketplace/orders/{order_id}/messages`

Returns a list of the order’s messages with the most recent first. Accepts [Pagination parameters](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Amarketplace#page:home,header:home-pagination).  
[Authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Amarketplace#page:authentication) as the seller is required.

- **Parameters**
- order_id
    
    `string` (required) **Example:** 1-1
    
    The ID of the order you are fetching
    

- **Response  `200`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 200 OKReproxy-Status: yesAccess-Control-Allow-Origin: *Cache-Control: public, must-revalidateContent-Type: application/jsonServer: lighttpdContent-Length: 780Date: Tue, 15 Jul 2014 19:59:59 GMTX-Varnish: 1702965334Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "pagination": {
        "per_page": 50,
        "items": 8,
        "page": 1,
        "urls": {},
        "pages": 1
      },
      "messages": [
        {
          "refund": {
            "amount": 5,
            "order": {
              "resource_url": "https://api.discogs.com/marketplace/orders/845236-9",
              "id": "845236-9"
            }
          },
          "timestamp": "2015-06-02T13:17:54-07:00",
          "message": "example_buyer received refund of $5.00.",
          "type": "refund_received",
          "order": {
            "resource_url": "https://api.discogs.com/marketplace/orders/845236-9",
            "id": "845236-9"
          },
          "subject": ""
        },
        {
          "refund": {
            "amount": 5,
            "order": {
              "resource_url": "https://api.discogs.com/marketplace/orders/845236-9",
              "id": "845236-9"
            }
          },
          "timestamp": "2015-06-02T13:17:44-07:00",
          "message": "example_seller sent refund of $5.00.",
          "type": "refund_sent",
          "order": {
            "resource_url": "https://api.discogs.com/marketplace/orders/845236-9",
            "id": "845236-9"
          },
          "subject": ""
        },
        {
          "from": {
            "id": 1001,
            "username": "example_seller",
            "avatar_url": "https://secure.gravatar.com/avatar/1ddcc19fb43551fb86c143465f773282?s=300&r=pg&d=mm",
            "resource_url": "https://api.discogs.com/users/example_seller"
          },
          "timestamp": "2015-06-02T13:17:07-07:00",
          "message": "Thank you for your order!",
          "type": "message",
          "order": {
            "resource_url": "https://api.discogs.com/marketplace/orders/845236-9",
            "id": "845236-9"
          },
          "subject": "New Message - Order #845236-9 - TZ Goes Beyond 10! + 1 more item"
        },
        {
          "status_id": 6,
          "timestamp": "2015-06-02T13:16:57-07:00",
          "actor": {
            "username": "example_seller",
            "resource_url": "https://api.discogs.com/users/example_seller"
          },
          "message": "example_buyer changed the order status to Shipped.",
          "type": "status",
          "order": {
            "resource_url": "https://api.discogs.com/marketplace/orders/845236-9",
            "id": "845236-9"
          },
          "subject": ""
        },
        {
          "status_id": 5,
          "timestamp": "2015-06-02T13:16:51-07:00",
          "actor": {
            "username": "example_seller",
            "resource_url": "https://api.discogs.com/users/example_seller"
          },
          "message": "example_buyer changed the order status to Payment Received.",
          "type": "status",
          "order": {
            "resource_url": "https://api.discogs.com/marketplace/orders/845236-9",
            "id": "845236-9"
          },
          "subject": ""
        },
        {
          "status_id": 3,
          "timestamp": "2015-06-02T13:16:27-07:00",
          "actor": {
            "username": "example_seller",
            "resource_url": "https://api.discogs.com/users/example_seller"
          },
          "message": "example_buyer changed the order status to Invoice Sent.",
          "type": "status",
          "order": {
            "resource_url": "https://api.discogs.com/marketplace/orders/845236-9",
            "id": "845236-9"
          },
          "subject": ""
        },
        {
          "timestamp": "2015-06-02T13:16:27-07:00",
          "original": 0,
          "new": 5,
          "message": "example_seller set the shipping price to $5.00.",
          "type": "shipping",
          "order": {
            "resource_url": "https://api.discogs.com/marketplace/orders/845236-9",
            "id": "845236-9"
          },
          "subject": ""
        },
        {
          "status_id": 1,
          "timestamp": "2015-06-02T13:16:12-07:00",
          "actor": {
            "username": "example_seller",
            "resource_url": "https://api.discogs.com/users/example_seller"
          },
          "message": "example_seller created the order by merging orders #845236-7, #845236-8.",
          "type": "status",
          "order": {
            "resource_url": "https://api.discogs.com/marketplace/orders/845236-9",
            "id": "845236-9"
          },
          "subject": ""
        }
      ]
    }
    ```
    

`/marketplace/orders/{order_id}/messages`

Adds a new message to the order’s message log.  
When posting a new message, you can simultaneously change the order status. If you do, the message will automatically be prepended with:  
`Seller changed status from Old Status to New Status`  
While `message` and `status` are each optional, one or both must be present.

- **Parameters**
- order_id
    
    `string` (required) **Example:** 1-1
    
    The ID of the order you are fetching
    
    message
    
    `string` (optional) **Example:** hello world
    
    status
    
    `string` (optional) **Example:** New Order
    

- **Request**
- ##### Headers
    
    ```
    Content-Type: application/json
    ```
    
- **Response  `201`**
- ##### Body
    
    ```
    {
      "from": {
        "username": "example_seller",
        "resource_url": "https://api.discogs.com/users/example_seller"
      },
      "message": "Seller changed status from Payment Received to Shipped\n\nYour order is on its way, tracking number #foobarbaz!",
      "order": {
        "resource_url": "https://api.discogs.com/marketplace/orders/1-1",
        "id": "1-1"
      },
      "timestamp": "2011-11-18T15:32:42-07:00",
      "subject": "Discogs Order #1-1, Stockholm"
    }
    ```
    
- **Response  `403`**
- ##### Body
    
    ```
    {
      "message": "You don't have permission to access this resource."
    }
    ```
    

## Fee [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Amarketplace#page:marketplace,header:marketplace-fee)

`/marketplace/fee/{price}`

The Fee resource allows you to quickly calculate the fee for selling an item on the Marketplace.

- **Parameters**
- price
    
    `number` (optional) **Example:** 10.00
    
    The price to calculate a fee from
    

- **Response  `200`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 200 OKReproxy-Status: yesAccess-Control-Allow-Origin: *Cache-Control: public, must-revalidateContent-Type: application/jsonServer: lighttpdContent-Length: 780Date: Tue, 15 Jul 2014 19:59:59 GMTX-Varnish: 1702965334Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
        "value": 0.42,
        "currency": "USD",
    }
    ```
    

## Fee with currency [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Amarketplace#page:marketplace,header:marketplace-fee-with-currency)

`/marketplace/fee/{price}/{currency}`

The Fee resource allows you to quickly calculate the fee for selling an item on the Marketplace given a particular currency.

- **Parameters**
- price
    
    `number` (optional) **Example:** 10.00
    
    The price to calculate a fee from
    
    currency
    
    `string` (optional) **Example:** USD
    
    Defaults to `USD`. Must be one of the following:  
    `USD` `GBP` `EUR` `CAD` `AUD` `JPY` `CHF` `MXN` `BRL` `NZD` `SEK` `ZAR`
    

- **Response  `200`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 200 OKReproxy-Status: yesAccess-Control-Allow-Origin: *Cache-Control: public, must-revalidateContent-Type: application/jsonServer: lighttpdContent-Length: 780Date: Tue, 15 Jul 2014 19:59:59 GMTX-Varnish: 1702965334Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
        "value": 0.42,
        "currency": "USD",
    }
    ```
    

## Price Suggestions [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Amarketplace#page:marketplace,header:marketplace-price-suggestions)

`/marketplace/price_suggestions/{release_id}`

Retrieve price suggestions for the provided Release ID. If no suggestions are available, an empty object will be returned.  
[Authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Amarketplace#page:authentication) is required, and the user needs to have filled out their seller settings. Suggested prices will be denominated in the user’s selling currency.

- **Parameters**
- release_id
    
    `number` (required) **Example:** 1
    
    The release ID to calculate a price from.
    

- **Response  `200`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 200 OKReproxy-Status: yesAccess-Control-Allow-Origin: *Cache-Control: public, must-revalidateContent-Type: application/jsonServer: lighttpdContent-Length: 780Date: Tue, 15 Jul 2014 19:59:59 GMTX-Varnish: 1702965334Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "Very Good (VG)": {
        "currency": "USD",
        "value": 6.7827501
      },
      "Good Plus (G+)": {
        "currency": "USD",
        "value": 3.7681945000000003
      },
      "Near Mint (NM or M-)": {
        "currency": "USD",
        "value": 12.8118613
      },
      "Good (G)": {
        "currency": "USD",
        "value": 2.2609167
      },
      "Very Good Plus (VG+)": {
        "currency": "USD",
        "value": 9.7973057
      },
      "Mint (M)": {
        "currency": "USD",
        "value": 14.319139100000001
      },
      "Fair (F)": {
        "currency": "USD",
        "value": 1.5072778000000002
      },
      "Poor (P)": {
        "currency": "USD",
        "value": 0.7536389000000001
      }
    }
    ```
    

## Release Statistics [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Amarketplace#page:marketplace,header:marketplace-release-statistics)

`/marketplace/stats/{release_id}{?curr_abbr}`

Retrieve marketplace statistics for the provided Release ID. These statistics reflect the state of the release in the marketplace _currently_, and include the number of items currently for sale, lowest listed price of any item for sale, and whether the item is blocked for sale in the marketplace.

[Authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Amarketplace#page:authentication) is optional. Authenticated users will by default have the lowest currency expressed in their own buyer currency, configurable in [buyer settings](https://www.discogs.com/settings/buyer), in the absence of the `curr_abbr` query parameter to specify the currency. Unauthenticated users will have the price expressed in US Dollars, if no `curr_abbr` is provided.

Releases that have no items for sale in the marketplace will return a body with null data in the `lowest_price` and `num_for_sale` keys. Releases that are blocked for sale will also have null data for these keys.

- **Parameters**
- release_id
    
    `number` (required) **Example:** 1
    
    The release ID whose stats are desired
    
    curr_abbr
    
    `string` (optional) **Example:** USD
    
    Currency for marketplace data. Defaults to the authenticated users currency. Must be one of the following:  
    `USD` `GBP` `EUR` `CAD` `AUD` `JPY` `CHF` `MXN` `BRL` `NZD` `SEK` `ZAR`
    

- **Response  `200`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 200 OKReproxy-Status: yesAccess-Control-Allow-Origin: *Cache-Control: public, must-revalidateContent-Type: application/jsonServer: lighttpdContent-Length: 780Date: Tue, 15 Jul 2014 19:59:59 GMTX-Varnish: 1702965334Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "lowest_price": {
        "currency": "USD",
        "value": 2.09
      },
      "num_for_sale": 26,
      "blocked_from_sale": false
    }
    ```