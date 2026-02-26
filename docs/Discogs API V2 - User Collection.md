[discogs.com](https://www.discogs.com/developers/#page:user-collection)

# User Collection - Discogs API Documentation

---

## Collection [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-collection#page:user-collection,header:user-collection-collection)

The Collection resource allows you to view and manage a user’s collection.  
A collection is arranged into folders. Every user has two permanent folders already:

ID `0`, the “All” folder, which cannot have releases added to it, and  
ID `1`, the “Uncategorized” folder.

Because it’s possible to own more than one copy of a release, each with its own notes, grading, and so on, each instance of a release in a folder has an instance ID.

Through the Discogs website, users can create custom notes fields. There is not yet an API method for creating and deleting these fields, but they can be listed, and the values of the fields on any instance can be modified.

`/users/{username}/collection/folders`

Retrieve a list of folders in a user’s collection. If the collection has been made private by its owner, [authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-collection#page:authentication) as the collection owner is required. If you are not authenticated as the collection owner, only folder ID 0 (the “All” folder) will be visible (if the requested user’s collection is public).

- **Parameters**
- username
    
    `string` (required) **Example:** rodneyfool
    
    The username of the collection you are trying to retrieve.
    

- **Response  `200`**
- ##### Headers
    
    ```
    Reproxy-Status: yesAccess-Control-Allow-Origin: *Cache-Control: public, must-revalidateContent-Type: application/jsonServer: lighttpdContent-Length: 132Date: Wed, 16 Jul 2014 23:20:21 GMTX-Varnish: 1722533701Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "folders": [
        {
          "id": 0,
          "count": 23,
          "name": "All",
          "resource_url": "https://api.discogs.com/users/example/collection/folders/0"
        },
        {
          "id": 1,
          "count": 20,
          "name": "Uncategorized",
          "resource_url": "https://api.discogs.com/users/example/collection/folders/1"
        }
      ]
    }
    ```
    

`/users/{username}/collection/folders`

Create a new folder in a user’s collection.

[Authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-collection#page:authentication) as the collection owner is required.

- **Parameters**
- username
    
    `string` (required) **Example:** rodneyfool
    
    The username of the collection you are trying to retrieve.
    
    name
    
    `string` (optional) **Example:** My favorites
    
    The name of the newly-created folder.
    

- **Response  `201`**
- ##### Body
    
    ```
    {
      "id": 232842,
      "name": "My Music",
      "count": 0,
      "resource_url": "https://api.discogs.com/users/example/collection/folders/232842"
    }
    ```
    

## Collection Folder [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-collection#page:user-collection,header:user-collection-collection-folder)

`/users/{username}/collection/folders/{folder_id}`

Retrieve metadata about a folder in a user’s collection.

If `folder_id` is not `0`, [authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-collection#page:authentication) as the collection owner is required.

- **Parameters**
- username
    
    `string` (required) **Example:** rodneyfool
    
    The username of the collection you are trying to request.
    
    folder_id
    
    `number` (required) **Example:** 3
    
    The ID of the folder to request.
    

- **Response  `200`**
- ##### Headers
    
    ```
    Reproxy-Status: yesAccess-Control-Allow-Origin: *Cache-Control: public, must-revalidateContent-Type: application/jsonServer: lighttpdContent-Length: 132Date: Wed, 16 Jul 2014 23:20:21 GMTX-Varnish: 1722533701Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "id": 1,
      "count": 20,
      "name": "Uncategorized",
      "resource_url": "https://api.discogs.com/users/example/collection/folders/1"
    }
    ```
    

`/users/{username}/collection/folders/{folder_id}`

Edit a folder’s metadata. Folders `0` and `1` cannot be renamed.

[Authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-collection#page:authentication) as the collection owner is required.

- **Parameters**
- username
    
    `string` (required) **Example:** rodneyfool
    
    The username of the collection you are trying to modify.
    
    folder_id
    
    `number` (required) **Example:** 3
    
    The ID of the folder to modify.
    

- **Response  `200`**
- ##### Body
    
    ```
    {
      "id": 392,
      "count": 3,
      "name": "An Example Folder",
      "resource_url": "https://api.discogs.com/users/example/collection/folders/392"
    }
    ```
    

`/users/{username}/collection/folders/{folder_id}`

Delete a folder from a user’s collection. A folder must be empty before it can be deleted.

[Authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-collection#page:authentication) as the collection owner is required.

- **Parameters**
- username
    
    `string` (required) **Example:** rodneyfool
    
    The username of the collection you are trying to modify.
    
    folder_id
    
    `number` (required) **Example:** 3
    
    The ID of the folder to delete.
    

- **Response  `204`**

## Collection Items By Release [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-collection#page:user-collection,header:user-collection-collection-items-by-release)

`/users/{username}/collection/releases/{release_id}`

View the user’s collection folders which contain a specified release. This will also show information about each release instance.

The `release_id` must be non-zero.

[Authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-collection#page:authentication) as the collection owner is required if the owner’s collection is private.

- **Parameters**
- username
    
    `string` (required) **Example:** susan.salkeld
    
    The username of the collection you are trying to view.
    
    release_id
    
    `number` (required) **Example:** 7781525
    
    The ID of the release to request.
    

- **Response  `200`**
- ##### Body
    
    ```
    {
      "pagination": {
        "per_page": 50,
        "items": 28,
        "page": 1,
        "urls": {},
        "pages": 1
      },
      "releases": [
        {
          "instance_id": 148842233,
          "rating": 4,
          "basic_information": {
            "labels": [
              {
                "name": "Varèse Vintage",
                "entity_type": "1",
                "catno": "302 067 361 1",
                "resource_url": "http://api.discogs.com/labels/151979",
                "id": 151979,
                "entity_type_name": "Label"
              }
            ],
            "formats": [
              {
                "descriptions": [
                  "LP",
                  "Album",
                  "Compilation",
                  "Limited Edition",
                  "Mono"
                ],
                "name": "Vinyl",
                "qty": "2"
              }
            ],
            "thumb": "http://api-img.discogs.com/FGmDbZ6M9wNPwEAsn0yWz1jzQuI=/fit-in/150x150/filters:strip_icc():format(jpeg):mode_rgb():quality(90)/discogs-images/R-7781525-1449187274-5587.jpeg.jpg",
            "title": "The BBC Radio Sessions",
            "artists": [
              {
                "join": ",",
                "name": "The Zombies",
                "anv": "",
                "tracks": "",
                "role": "",
                "resource_url": "http://api.discogs.com/artists/262221",
                "id": 262221
              }
            ],
            "resource_url": "http://api.discogs.com/releases/7781525",
            "year": 2015,
            "id": 7781525
          },
          "folder_id": 688739,
          "date_added": "2015-11-30T10:54:13-08:00",
          "id": 7781525
        },
        {
          "instance_id": 181301430,
          "rating": 4,
          "basic_information": {
            "labels": [
              {
                "name": "Varèse Vintage",
                "entity_type": "1",
                "catno": "302 067 361 1",
                "resource_url": "http://api.discogs.com/labels/151979",
                "id": 151979,
                "entity_type_name": "Label"
              }
            ],
            "formats": [
              {
                "descriptions": [
                  "LP",
                  "Album",
                  "Compilation",
                  "Limited Edition",
                  "Mono"
                ],
                "name": "Vinyl",
                "qty": "2"
              }
            ],
            "thumb": "http://api-img.discogs.com/FGmDbZ6M9wNPwEAsn0yWz1jzQuI=/fit-in/150x150/filters:strip_icc():format(jpeg):mode_rgb():quality(90)/discogs-images/R-7781525-1449187274-5587.jpeg.jpg",
            "title": "The BBC Radio Sessions",
            "artists": [
              {
                "join": ",",
                "name": "The Zombies",
                "anv": "",
                "tracks": "",
                "role": "",
                "resource_url": "http://api.discogs.com/artists/262221",
                "id": 262221
              }
            ],
            "resource_url": "http://api.discogs.com/releases/7781525",
            "year": 2015,
            "id": 7781525
          },
          "folder_id": 1,
          "date_added": "2016-07-27T08:11:29-07:00",
          "id": 7781525
        },
        {
          "instance_id": 181301442,
          "rating": 4,
          "basic_information": {
            "labels": [
              {
                "name": "Varèse Vintage",
                "entity_type": "1",
                "catno": "302 067 361 1",
                "resource_url": "http://api.discogs.com/labels/151979",
                "id": 151979,
                "entity_type_name": "Label"
              }
            ],
            "formats": [
              {
                "descriptions": [
                  "LP",
                  "Album",
                  "Compilation",
                  "Limited Edition",
                  "Mono"
                ],
                "name": "Vinyl",
                "qty": "2"
              }
            ],
            "thumb": "http://api-img.discogs.com/FGmDbZ6M9wNPwEAsn0yWz1jzQuI=/fit-in/150x150/filters:strip_icc():format(jpeg):mode_rgb():quality(90)/discogs-images/R-7781525-1449187274-5587.jpeg.jpg",
            "title": "The BBC Radio Sessions",
            "artists": [
              {
                "join": ",",
                "name": "The Zombies",
                "anv": "",
                "tracks": "",
                "role": "",
                "resource_url": "http://api.discogs.com/artists/262221",
                "id": 262221
              }
            ],
            "resource_url": "http://api.discogs.com/releases/7781525",
            "year": 2015,
            "id": 7781525
          },
          "folder_id": 688739,
          "date_added": "2016-07-27T08:11:35-07:00",
          "id": 7781525
        }
      ]
    }
    ```
    

## Collection Items By Folder [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-collection#page:user-collection,header:user-collection-collection-items-by-folder)

`/users/{username}/collection/folders/{folder_id}/releases`

Returns the list of item in a folder in a user’s collection. Accepts [Pagination](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-collection#page:home,header:home-pagination) parameters.

Basic information about each release is provided, suitable for display in a list. For detailed information, make another API call to fetch the corresponding release.

If `folder_id` is not `0`, or the collection has been made private by its owner, [authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-collection#page:authentication) as the collection owner is required.

If you are not authenticated as the collection owner, only public notes fields will be visible.

Valid `sort` keys are:  
`label`  
`artist`  
`title`  
`catno`  
`format`  
`rating`  
`added`  
`year`

- **Parameters**
- username
    
    `string` (required) **Example:** rodneyfool
    
    The username of the collection you are trying to request.
    
    folder_id
    
    `number` (required) **Example:** 3
    
    The ID of the folder to request.
    
    sort
    
    `string` (optional) **Example:** artist
    
    Sort items by this field (see below for all valid `sort` keys.
    
    sort_order
    
    `string` (optional) **Example:** desc
    
    Sort items in a particular order (`asc` or `desc`)
    

- **Response  `200`**
- ##### Headers
    
    ```
    Reproxy-Status: yesAccess-Control-Allow-Origin: *Cache-Control: public, must-revalidateContent-Type: application/jsonServer: lighttpdContent-Length: 132Date: Wed, 16 Jul 2014 23:20:21 GMTX-Varnish: 1722533701Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "pagination": {
        "per_page": 1,
        "pages": 14,
        "page": 1,
        "items": 14,
        "urls": {
          "next": "https://api.discogs.com/users/example/collection/folders/1/releases?page=2&per_page=1",
          "last": "https://api.discogs.com/users/example/collection/folders/1/releases?page=2&per_page=14",
        }
      },
      "releases": [
        {
          "id": 2464521,
          "instance_id": 1,
          "folder_id": 1,
          "rating": 0,
          "basic_information": {
            "id": 2464521,
            "title": "Information Chase",
            "year": 2006,
            "resource_url": "https://api.discogs.com/releases/2464521",
            "thumb": "https://api-img.discogs.com/vzpYq4_kc52GZFs14c0SCJ0ZE84=/fit-in/150x150/filters:strip_icc():format(jpeg):mode_rgb()/discogs-images/R-2464521-1285519861.jpeg.jpg",
            "cover_image": "https://api-img.discogs.com/vzpYq4_kc52GZFs14c0SCJ0ZE84/fit-in/500x500/filters:strip_icc():format(jpeg):mode_rgb():quality(90)/discogs-images/R-2464521-1285519861.jpeg.jpg",
            "formats": [
              {
                "qty": "1",
                "descriptions": [ "Mini", "EP" ],
                "name": "CDr"
              }
            ],
            "labels": [
              {
                "resource_url": "https://api.discogs.com/labels/11647",
                "entity_type": "",
                "catno": "8BP059",
                "id": 11647,
                "name": "8bitpeoples"
              }
            ],
            "artists": [
              {
                "id": 103906,
                "name": "Bit Shifter",
                "join": "",
                "resource_url": "https://api.discogs.com/artists/103906",
                "anv": "",
                "tracks": "",
                "role": ""
              }
            ],
            "genres": [
                "Electronic", 
                "Pop"
            ],
            "styles": [
                "Chiptune"
            ]
          },
          "notes": [
            {
              "field_id": 3,
              "value": "bleep bloop blorp."
            }
          ]
        }
      ]
    }
    ```
    

## Add To Collection Folder [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-collection#page:user-collection,header:user-collection-add-to-collection-folder)

`/users/{username}/collection/folders/{folder_id}/releases/{release_id}`

Add a release to a folder in a user’s collection.

The `folder_id` must be non-zero – you can use `1` for “Uncategorized”.

[Authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-collection#page:authentication) as the collection owner is required.

- **Parameters**
- username
    
    `string` (required) **Example:** rodneyfool
    
    The username of the collection you are trying to modify.
    
    folder_id
    
    `number` (required) **Example:** 3
    
    The ID of the folder to modify.
    
    release_id
    
    `number` (required) **Example:** 130076
    
    The ID of the release you are adding.
    

- **Response  `201`**
- ##### Body
    
    ```
    {
      "instance_id": 3,
      "resource_url": "https://api.discogs.com/users/example/collection/folders/1/release/1/instance/3"
    }
    ```
    

## Change Rating Of Release [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-collection#page:user-collection,header:user-collection-change-rating-of-release)

`/users/{username}/collection/folders/{folder_id}/releases/{release_id}/instances/{instance_id}`

Change the rating on a release and/or move the instance to another folder.

This endpoint potentially takes 2 `folder_id` parameters: one in the URL (which is the folder you are requesting, and is required), and one in the request body (representing the folder you want to move the instance to, which is optional)

[Authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-collection#page:authentication) as the collection owner is required.

- **Parameters**
- username
    
    `string` (required) **Example:** rodneyfool
    
    The username of the collection you are trying to modify.
    
    folder_id
    
    `number` (optional) **Example:** 4
    
    The ID of the folder to modify (this parameter is set in the request body and is set if you want to move the instance to this folder).
    
    release_id
    
    `number` (required) **Example:** 130076
    
    The ID of the release you are modifying.
    
    instance_id
    
    `number` (required) **Example:** 1
    
    The ID of the instance.
    
    rating
    
    `number` (optional) **Example:** 5
    
    The rating of the instance you are supplying.
    

- **Response  `204`**

## Delete Instance From Folder [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-collection#page:user-collection,header:user-collection-delete-instance-from-folder)

`/users/{username}/collection/folders/{folder_id}/releases/{release_id}/instances/{instance_id}`

Remove an instance of a release from a user’s collection folder.

To move the release to the “Uncategorized” folder instead, use the `POST` method.

[Authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-collection#page:authentication) as the collection owner is required.

- **Parameters**
- username
    
    `string` (required) **Example:** rodneyfool
    
    The username of the collection you are trying to modify.
    
    folder_id
    
    `number` (required) **Example:** 3
    
    The ID of the folder to modify.
    
    release_id
    
    `number` (required) **Example:** 130076
    
    The ID of the release you are modifying.
    
    instance_id
    
    `number` (required) **Example:** 1
    
    The ID of the instance.
    

- **Response  `204`**
- **Response  `403`**
- ##### Body
    
    ```
    {
      "message": "You don't have permission to access this resource."
    }
    ```
    

## List Custom Fields [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-collection#page:user-collection,header:user-collection-list-custom-fields)

`/users/{username}/collection/fields`

Retrieve a list of user-defined collection notes fields. These fields are available on every release in the collection.

If the collection has been made private by its owner, [authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-collection#page:authentication) as the collection owner is required.

If you are not authenticated as the collection owner, only fields with public set to true will be visible.

- **Parameters**
- username
    
    `string` (required) **Example:** rodneyfool
    
    The username of the collection you are trying to modify.
    

- **Response  `200`**
- ##### Body
    
    ```
    {
      "fields": [
        {
          "name": "Media",
          "options": [
            "Mint (M)",
            "Near Mint (NM or M-)",
            "Very Good Plus (VG+)",
            "Very Good (VG)",
            "Good Plus (G+)",
            "Good (G)",
            "Fair (F)",
            "Poor (P)"
          ],
          "id": 1,
          "position": 1,
          "type": "dropdown",
          "public": true
        },
        {
          "name": "Sleeve",
          "options": [
            "Generic",
            "No Cover",
            "Mint (M)",
            "Near Mint (NM or M-)",
            "Very Good Plus (VG+)",
            "Very Good (VG)",
            "Good Plus (G+)",
            "Good (G)",
            "Fair (F)",
            "Poor (P)"
          ],
          "id": 2,
          "position": 2,
          "type": "dropdown",
          "public": true
        },
        {
          "name": "Notes",
          "lines": 3,
          "id": 3,
          "position": 3,
          "type": "textarea",
          "public": true
        }
      ]
    }
    ```
    

## Edit Fields Instance [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-collection#page:user-collection,header:user-collection-edit-fields-instance)

`/users/{username}/collection/folders/{folder_id}/releases/{release_id}/instances/{instance_id}/fields/{field_id}{?value}`

Change the value of a notes field on a particular instance.

- **Parameters**
- username
    
    `string` (required) **Example:** rodneyfool
    
    The username of the collection you are trying to modify.
    
    value
    
    `string` (required) **Example:** foo
    
    The new value of the field. If the field’s type is `dropdown`, the `value` must match one of the values in the field’s list of options.
    
    folder_id
    
    `number` (required) **Example:** 3
    
    The ID of the folder to modify.
    
    release_id
    
    `number` (required) **Example:** 130076
    
    The ID of the release you are modifying.
    
    instance_id
    
    `number` (required) **Example:** 1
    
    The ID of the instance.
    
    field_id
    
    `number` (required) **Example:** 8
    
    The ID of the field.
    

- **Response  `204`**

## Collection Value [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-collection#page:user-collection,header:user-collection-collection-value)

`/users/{username}/collection/value`

Returns the minimum, median, and maximum value of a user’s collection.

[Authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-collection#page:authentication) as the collection owner is required.

- **Parameters**
- username
    
    `string` (required) **Example:** rodneyfool
    
    The username of the collection you are trying to modify.
    

- **Response  `200`**
- ##### Body
    
    ```
    {
      "maximum": "$250.00",
      "median": "$100.25",
      "minimum": "$75.50"
    }
    ```