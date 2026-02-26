[discogs.com](https://www.discogs.com/developers/#page:database)

# Database - Discogs API Documentation

---

## Release [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Adatabase#page:database,header:database-release)

The Release resource represents a particular physical or digital object released by one or more Artists.

`/releases/{release_id}{?curr_abbr}`

Get a release

- **Parameters**
- release_id
    
    `number` (required) **Example:** 249504
    
    The Release ID
    
    curr_abbr
    
    `string` (optional) **Example:** USD
    
    Currency for marketplace data. Defaults to the authenticated users currency. Must be one of the following:  
    `USD` `GBP` `EUR` `CAD` `AUD` `JPY` `CHF` `MXN` `BRL` `NZD` `SEK` `ZAR`
    

- **Response  `200`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 200 OKReproxy-Status: yesAccess-Control-Allow-Origin: *Content-Type: application/jsonServer: lighttpdContent-Length: 6223Date: Tue, 01 Jul 2014 00:59:34 GMTX-Varnish: 1465474310Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
        "title": "Never Gonna Give You Up",
        "id": 249504,
        "artists": [
            {
                "anv": "",
                "id": 72872,
                "join": "",
                "name": "Rick Astley",
                "resource_url": "https://api.discogs.com/artists/72872",
                "role": "",
                "tracks": ""
            }
        ],
        "data_quality": "Correct",
        "thumb": "https://api-img.discogs.com/kAXVhuZuh_uat5NNr50zMjN7lho=/fit-in/300x300/filters:strip_icc():format(jpeg):mode_rgb()/discogs-images/R-249504-1334592212.jpeg.jpg",
        "community": {
            "contributors": [
                {
                    "resource_url": "https://api.discogs.com/users/memory",
                    "username": "memory"
                },
                {
                    "resource_url": "https://api.discogs.com/users/_80_",
                    "username": "_80_"
                }
            ],
            "data_quality": "Correct",
            "have": 252,
            "rating": {
                "average": 3.42,
                "count": 45
            },
            "status": "Accepted",
            "submitter": {
                "resource_url": "https://api.discogs.com/users/memory",
                "username": "memory"
            },
            "want": 42
        },
        "companies": [
            {
                "catno": "",
                "entity_type": "13",
                "entity_type_name": "Phonographic Copyright (p)",
                "id": 82835,
                "name": "BMG Records (UK) Ltd.",
                "resource_url": "https://api.discogs.com/labels/82835"
            },
            {
                "catno": "",
                "entity_type": "29",
                "entity_type_name": "Mastered At",
                "id": 266218,
                "name": "Utopia Studios",
                "resource_url": "https://api.discogs.com/labels/266218"
            }
        ],
        "country": "UK",
        "date_added": "2004-04-30T08:10:05-07:00",
        "date_changed": "2012-12-03T02:50:12-07:00",
        "estimated_weight": 60,
        "extraartists": [
            {
                "anv": "Me Co",
                "id": 547352,
                "join": "",
                "name": "Me Company",
                "resource_url": "https://api.discogs.com/artists/547352",
                "role": "Design",
                "tracks": ""
            },
            {
                "anv": "Stock / Aitken / Waterman",
                "id": 20942,
                "join": "",
                "name": "Stock, Aitken & Waterman",
                "resource_url": "https://api.discogs.com/artists/20942",
                "role": "Producer, Written-By",
                "tracks": ""
            }
        ],
        "format_quantity": 1,
        "formats": [
            {
                "descriptions": [
                    "7\"",
                    "Single",
                    "45 RPM"
                ],
                "name": "Vinyl",
                "qty": "1"
            }
        ],
        "genres": [
            "Electronic",
            "Pop"
        ],
        "identifiers": [
            {
                "type": "Barcode",
                "value": "5012394144777"
            },
        ],
        "images": [
            {
                "height": 600,
                "resource_url": "https://api-img.discogs.com/z_u8yqxvDcwVnR4tX2HLNLaQO2Y=/fit-in/600x600/filters:strip_icc():format(jpeg):mode_rgb():quality(96)/discogs-images/R-249504-1334592212.jpeg.jpg",
                "type": "primary",
                "uri": "https://api-img.discogs.com/z_u8yqxvDcwVnR4tX2HLNLaQO2Y=/fit-in/600x600/filters:strip_icc():format(jpeg):mode_rgb():quality(96)/discogs-images/R-249504-1334592212.jpeg.jpg",
                "uri150": "https://api-img.discogs.com/0ZYgPR4X2HdUKA_jkhPJF4SN5mM=/fit-in/150x150/filters:strip_icc():format(jpeg):mode_rgb()/discogs-images/R-249504-1334592212.jpeg.jpg",
                "width": 600
            },
            {
                "height": 600,
                "resource_url": "https://api-img.discogs.com/EnQXaDOs5T6YI9zq-R5I_mT7hSk=/fit-in/600x600/filters:strip_icc():format(jpeg):mode_rgb():quality(96)/discogs-images/R-249504-1334592228.jpeg.jpg",
                "type": "secondary",
                "uri": "https://api-img.discogs.com/EnQXaDOs5T6YI9zq-R5I_mT7hSk=/fit-in/600x600/filters:strip_icc():format(jpeg):mode_rgb():quality(96)/discogs-images/R-249504-1334592228.jpeg.jpg",
                "uri150": "https://api-img.discogs.com/abk0FWgWsRDjU4bkCDwk0gyMKBo=/fit-in/150x150/filters:strip_icc():format(jpeg):mode_rgb()/discogs-images/R-249504-1334592228.jpeg.jpg",
                "width": 600
            }
        ],
        "labels": [
            {
                "catno": "PB 41447",
                "entity_type": "1",
                "id": 895,
                "name": "RCA",
                "resource_url": "https://api.discogs.com/labels/895"
            }
        ],
        "lowest_price": 0.63,
        "master_id": 96559,
        "master_url": "https://api.discogs.com/masters/96559",
        "notes": "UK Release has a black label with the text \"Manufactured In England\" printed on it.\r\n\r\nSleeve:\r\n\u2117 1987 \u2022 BMG Records (UK) Ltd. \u00a9 1987 \u2022 BMG Records (UK) Ltd.\r\nDistributed in the UK by BMG Records \u2022  Distribu\u00e9 en Europe par BMG/Ariola \u2022 Vertrieb en Europa d\u00fcrch BMG/Ariola.\r\n\r\nCenter labels:\r\n\u2117 1987 Pete Waterman Ltd.\r\nOriginal Sound Recording made by PWL.\r\nBMG Records (UK) Ltd. are the exclusive licensees for the world.\r\n\r\nDurations do not appear on the release.\r\n",
        "num_for_sale": 58,
        "released": "1987",
        "released_formatted": "1987",
        "resource_url": "https://api.discogs.com/releases/249504",
        "series": [],
        "status": "Accepted",
        "styles": [
            "Synth-pop"
        ],
        "tracklist": [
            {
                "duration": "3:32",
                "position": "A",
                "title": "Never Gonna Give You Up",
                "type_": "track"
            },
            {
                "duration": "3:30",
                "position": "B",
                "title": "Never Gonna Give You Up (Instrumental)",
                "type_": "track"
            }
        ],
        "uri": "https://www.discogs.com/Rick-Astley-Never-Gonna-Give-You-Up/release/249504",
        "videos": [
            {
                "description": "Rick Astley - Never Gonna Give You Up (Extended Version)",
                "duration": 330,
                "embed": true,
                "title": "Rick Astley - Never Gonna Give You Up (Extended Version)",
                "uri": "https://www.youtube.com/watch?v=te2jJncBVG4"
            },
        ],
        "year": 1987
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
      "message": "Release not found."
    }
    ```
    

## Release Rating By User [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Adatabase#page:database,header:database-release-rating-by-user)

The Release Rating endpoint retrieves, updates, or deletes the rating of a release for a given user.

`/releases/{release_id}/rating/{username}`

Retrieves the release’s rating for a given user.

- **Parameters**
- release_id
    
    `number` (required) **Example:** 249504
    
    The Release ID
    
    username
    
    `string` (required) **Example:** memory
    
    The username of the rating you are trying to request.
    

- **Response  `200`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 200 OKReproxy-Status: yesAccess-Control-Allow-Origin: *Content-Type: application/jsonServer: lighttpdContent-Length: 6223Date: Tue, 01 Jul 2014 00:59:34 GMTX-Varnish: 1465474310Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "username": "memory",
      "release_id": 249504,
      "rating": 5
    }
    ```
    

`/releases/{release_id}/rating/{username}`

Updates the release’s rating for a given user. [Authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Adatabase#page:authentication) as the user is required.

- **Parameters**
- release_id
    
    `number` (required) **Example:** 249504
    
    The Release ID
    
    username
    
    `string` (required) **Example:** memory
    
    The username of the rating you are trying to request.
    
    rating
    
    `int` (required) **Example:** 5
    
    The new rating for a release between 1 and 5.
    

- **Response  `200`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 200 OKReproxy-Status: yesAccess-Control-Allow-Origin: *Content-Type: application/jsonServer: lighttpdContent-Length: 6223Date: Tue, 01 Jul 2014 00:59:34 GMTX-Varnish: 1465474310Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "username": "memory",
      "release_id": 249504,
      "rating": 5
    }
    ```
    

`/releases/{release_id}/rating/{username}`

Deletes the release’s rating for a given user. [Authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Adatabase#page:authentication) as the user is required.

- **Parameters**
- release_id
    
    `number` (required) **Example:** 249504
    
    The Release ID
    
    username
    
    `string` (required) **Example:** memory
    
    The username of the rating you are trying to request.
    

The Community Release Rating endpoint retrieves the average rating and the total number of user ratings for a given release.

## Release Stats [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Adatabase#page:database,header:database-release-stats)

The Release Stats endpoint retrieves the total number of “haves” (in the community’s collections) and “wants” (in the community’s wantlists) for a given release.

`/releases/{release_id}/stats`

Retrieves the release’s “have” and “want” counts.

- **Parameters**
- release_id
    
    `number` (required) **Example:** 249504
    
    The Release ID
    

- **Response  `200`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 200 OKReproxy-Status: yesAccess-Control-Allow-Origin: *Content-Type: application/jsonServer: lighttpdContent-Length: 35Date: Mon, 31 Aug 2020 23:22:16 GMTX-Varnish: 1465474310Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "num_have": 2315,
      "num_want": 467
    }
    ```
    

## Master Release [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Adatabase#page:database,header:database-master-release)

The Master resource represents a set of similar Releases. Masters (also known as “master releases”) have a “main release” which is often the chronologically earliest.

`/masters/{master_id}`

Get a master release

- **Parameters**
- master_id
    
    `number` (required) **Example:** 1000
    
    The Master ID
    

- **Response  `200`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 200 OKReproxy-Status: yesAccess-Control-Allow-Origin: *Content-Type: application/jsonServer: lighttpdContent-Length: 7083Date: Tue, 01 Jul 2014 01:11:23 GMTX-Varnish: 1465622695Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "styles": [
        "Goa Trance"
      ],
      "genres": [
        "Electronic"
      ],
      "videos": [
        {
          "duration": 421,
          "description": "Electric Universe - Alien Encounter Part 2 (Spirit Zone 97)",
          "embed": true,
          "uri": "https://www.youtube.com/watch?v=n1LGinzMDi8",
          "title": "Electric Universe - Alien Encounter Part 2 (Spirit Zone 97)"
        }
      ],
      "title": "Stardiver",
      "main_release": 66785,
      "main_release_url": "https://api.discogs.com/releases/66785",
      "uri": "https://www.discogs.com/Electric-Universe-Stardiver/master/1000",
      "artists": [
        {
          "join": "",
          "name": "Electric Universe",
          "anv": "",
          "tracks": "",
          "role": "",
          "resource_url": "https://api.discogs.com/artists/21849",
          "id": 21849
        }
      ],
      "versions_url": "https://api.discogs.com/masters/1000/versions",
      "year": 1997,
      "images": [
        {
          "height": 569,
          "resource_url": "https://api-img.discogs.com/_0K5t_iLs6CzLPKTB4mwHVI3Vy0=/fit-in/600x569/filters:strip_icc():format(jpeg):mode_rgb():quality(96)/discogs-images/R-66785-1213949871.jpeg.jpg",
          "type": "primary",
          "uri": "https://api-img.discogs.com/_0K5t_iLs6CzLPKTB4mwHVI3Vy0=/fit-in/600x569/filters:strip_icc():format(jpeg):mode_rgb():quality(96)/discogs-images/R-66785-1213949871.jpeg.jpg",
          "uri150": "https://api-img.discogs.com/sSWjXKczZseDjX2QohG1Lc77F-w=/fit-in/150x150/filters:strip_icc():format(jpeg):mode_rgb()/discogs-images/R-66785-1213949871.jpeg.jpg",
          "width": 600
        },
        {
          "height": 296,
          "resource_url": "https://api-img.discogs.com/1iD31iOWgfgb2DpROI4_MvmceFw=/fit-in/600x296/filters:strip_icc():format(jpeg):mode_rgb():quality(96)/discogs-images/R-66785-1213950065.jpeg.jpg",
          "type": "secondary",
          "uri": "https://api-img.discogs.com/1iD31iOWgfgb2DpROI4_MvmceFw=/fit-in/600x296/filters:strip_icc():format(jpeg):mode_rgb():quality(96)/discogs-images/R-66785-1213950065.jpeg.jpg",
          "uri150": "https://api-img.discogs.com/Cm4Q_1S784pQeRfwa0lN2jsj47Y=/fit-in/150x150/filters:strip_icc():format(jpeg):mode_rgb()/discogs-images/R-66785-1213950065.jpeg.jpg",
          "width": 600
        }
      ],
      "resource_url": "https://api.discogs.com/masters/1000",
      "tracklist": [
        {
          "duration": "7:00",
          "position": "1",
          "type_": "track",
          "title": "Alien Encounter (Part 2)"
        },
        {
          "duration": "7:13",
          "position": "2",
          "type_": "track",
          "extraartists": [
            {
              "join": "",
              "name": "DJ Sangeet",
              "anv": "",
              "tracks": "",
              "role": "Written-By, Producer",
              "resource_url": "https://api.discogs.com/artists/25460",
              "id": 25460
            }
          ],
          "title": "From The Heart"
        },
        {
          "duration": "6:45",
          "position": "3",
          "type_": "track",
          "title": "Radio S.P.A.C.E."
        }
      ],
      "id": 1000,
      "num_for_sale": 9,
      "lowest_price": 9.36,
      "data_quality": "Correct"
    }
    ```
    
- **Response  `404`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 404 Not FoundReproxy-Status: yesAccess-Control-Allow-Origin: *Content-Type: application/jsonServer: lighttpdContent-Length: 40Date: Tue, 01 Jul 2014 01:11:21 GMTX-Varnish: 1465622316Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "message": "Master Release not found."
    }
    ```
    

## Master Release Versions [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Adatabase#page:database,header:database-master-release-versions)

`/masters/{master_id}/versions{?page,per_page}`

Retrieves a list of all Releases that are versions of this master. Accepts [Pagination](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Adatabase#page:home,header:home-pagination) parameters.

- **Parameters**
- master_id
    
    `number` (required) **Example:** 1000
    
    The Master ID
    
    page
    
    `number` (optional) **Example:** 3
    
    The page you want to request
    
    per_page
    
    `number` (optional) **Example:** 25
    
    The number of items per page
    
    format
    
    `string` (optional) **Example:** Vinyl
    
    The format to filter
    
    label
    
    `string` (optional) **Example:** Scorpio Music
    
    The label to filter
    
    released
    
    `string` (optional) **Example:** 1992
    
    The release year to filter
    
    country
    
    `string` (optional) **Example:** Belgium
    
    The country to filter
    
    sort
    
    `string` (optional) **Example:** released
    
    Sort items by this field:  
    `released` (i.e. year of the release)  
    `title` (i.e. title of the release)  
    `format`  
    `label`  
    `catno` (i.e. catalog number of the release)  
    `country`
    
    sort_order
    
    `string` (optional) **Example:** asc
    
    Sort items in a particular order (one of `asc`, `desc`)
    

- **Response  `200`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 200 OKReproxy-Status: yesAccess-Control-Allow-Origin: *Content-Type: application/jsonServer: lighttpdContent-Length: 2834Date: Tue, 01 Jul 2014 01:16:01 GMTX-Varnish: 1465678820Age: 0Via: 1.1 varnishConnection: keep-alive
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
      "versions": [
        {
          "status": "Accepted",
          "stats": {
            "user": {
              "in_collection": 0,
              "in_wantlist": 0
            },
            "community": {
              "in_collection": 1067,
              "in_wantlist": 765
            }
          },
          "thumb": "https://img.discogs.com/wV56xo0Ak0M2bTCC6B_heD7Dx_o=/fit-in/150x150/filters:strip_icc():format(jpeg):mode_rgb():quality(40)/discogs-images/R-18926-1381225536-8716.jpeg.jpg",
          "format": "12\", 33 ⅓ RPM",
          "country": "US",
          "title": "Plastic Dreams",
          "label": "Epic",
          "released": "1993",
          "major_formats": [
            "Vinyl"
          ],
          "catno": "49 74992",
          "resource_url": "https://api.discogs.com/releases/18926",
          "id": 18926
        },
        {
          "status": "Accepted",
          "stats": {
            "user": {
              "in_collection": 0,
              "in_wantlist": 0
            },
            "community": {
              "in_collection": 842,
              "in_wantlist": 762
            }
          },
          "thumb": "https://img.discogs.com/KAm38-Op5VlkvuJOaTGZieKwRVg=/fit-in/150x150/filters:strip_icc():format(jpeg):mode_rgb():quality(40)/discogs-images/R-34228-1215760312.jpeg.jpg",
          "format": "12\", 33 ⅓ RPM",
          "country": "UK",
          "title": "Plastic Dreams (Mixes)",
          "label": "R & S Records",
          "released": "1993",
          "major_formats": [
            "Vinyl"
          ],
          "catno": "RSGB 101T",
          "resource_url": "https://api.discogs.com/releases/34228",
          "id": 34228
        },
        {
          "status": "Accepted",
          "stats": {
            "user": {
              "in_collection": 0,
              "in_wantlist": 0
            },
            "community": {
              "in_collection": 20,
              "in_wantlist": 285
            }
          },
          "thumb": "https://img.discogs.com/CnovcvhAYIle0tYTTZHo42wPz88=/fit-in/150x150/filters:strip_icc():format(jpeg):mode_rgb():quality(40)/discogs-images/R-1873038-1249267784.jpeg.jpg",
          "format": "12\", White Label, 33 ⅓ RPM, Promo",
          "country": "UK",
          "title": "Plastic Dreams Mixes",
          "label": "R & S Records",
          "released": "1993",
          "major_formats": [
            "Vinyl"
          ],
          "catno": "RSGB 101 T",
          "resource_url": "https://api.discogs.com/releases/1873038",
          "id": 1873038
        }
      ]
    }
    ```
    
- **Response  `404`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 404 Not FoundReproxy-Status: yesAccess-Control-Allow-Origin: *Content-Type: application/jsonServer: lighttpdContent-Length: 40Date: Tue, 01 Jul 2014 01:20:23 GMTX-Varnish: 1465732620Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "message": "Master Release not found."
    }
    ```
    

## Artist [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Adatabase#page:database,header:database-artist)

The Artist resource represents a person in the Discogs database who contributed to a Release in some capacity.

`/artists/{artist_id}`

Get an artist

- **Parameters**
- artist_id
    
    `number` (required) **Example:** 108713
    
    The Artist ID
    

- **Response  `200`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 200 OKReproxy-Status: yesAccess-Control-Allow-Origin: *Content-Type: application/jsonServer: lighttpdContent-Length: 1258Date: Tue, 01 Jul 2014 01:06:53 GMTX-Varnish: 1465566651Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "namevariations": [
        "Nickleback"
      ],
      "profile": "Nickelback is a Canadian rock band from Hanna, Alberta formed in 1995. Nickelback's music is classed as hard rock and alternative metal. Nickelback is one of the most commercially successful Canadian groups, having sold almost 50 million albums worldwide, ranking as the 11th best selling music act of the 2000s, and is the 2nd best selling foreign act in the U.S. behind The Beatles for the 2000's.",
      "releases_url": "https://api.discogs.com/artists/108713/releases",
      "resource_url": "https://api.discogs.com/artists/108713",
      "uri": "https://www.discogs.com/artist/108713-Nickelback",
      "urls": [
        "http://www.nickelback.com/",
        "http://en.wikipedia.org/wiki/Nickelback"
      ],
      "data_quality": "Needs Vote",
      "id": 108713,
      "images": [
        {
          "height": 260,
          "resource_url": "https://api-img.discogs.com/9xJ5T7IBn23DDMpg1USsDJ7IGm4=/330x260/smart/filters:strip_icc():format(jpeg):mode_rgb():quality(96)/discogs-images/A-108713-1110576087.jpg.jpg",
          "type": "primary",
          "uri": "https://api-img.discogs.com/9xJ5T7IBn23DDMpg1USsDJ7IGm4=/330x260/smart/filters:strip_icc():format(jpeg):mode_rgb():quality(96)/discogs-images/A-108713-1110576087.jpg.jpg",
          "uri150": "https://api-img.discogs.com/--xqi8cBtaBZz3qOjVcvzGvNRmU=/150x150/smart/filters:strip_icc():format(jpeg):mode_rgb()/discogs-images/A-108713-1110576087.jpg.jpg",
          "width": 330
        },
        {
          "height": 500,
          "resource_url": "https://api-img.discogs.com/r1jRG8b9-nlqTHPlJ-t8JR5ugoA=/493x500/smart/filters:strip_icc():format(jpeg):mode_rgb():quality(96)/discogs-images/A-108713-1264273865.jpeg.jpg",
          "type": "secondary",
          "uri": "https://api-img.discogs.com/r1jRG8b9-nlqTHPlJ-t8JR5ugoA=/493x500/smart/filters:strip_icc():format(jpeg):mode_rgb():quality(96)/discogs-images/A-108713-1264273865.jpeg.jpg",
          "uri150": "https://api-img.discogs.com/6K-cI5xDgsurmc-2OX6uCygzDgw=/150x150/smart/filters:strip_icc():format(jpeg):mode_rgb()/discogs-images/A-108713-1264273865.jpeg.jpg",
          "width": 493
        }
      ],
      "members": [
        {
          "active": true,
          "id": 270222,
          "name": "Chad Kroeger",
          "resource_url": "https://api.discogs.com/artists/270222"
        },
        {
          "active": true,
          "id": 685755,
          "name": "Daniel Adair",
          "resource_url": "https://api.discogs.com/artists/685755"
        },
        {
          "active": true,
          "id": 685754,
          "name": "Mike Kroeger",
          "resource_url": "https://api.discogs.com/artists/685754"
        },
        {
          "active": true,
          "id": 685756,
          "name": "Ryan \"Vik\" Vikedal",
          "resource_url": "https://api.discogs.com/artists/685756"
        },
        {
          "active": true,
          "id": 685757,
          "name": "Ryan Peake",
          "resource_url": "https://api.discogs.com/artists/685757"
        }
      ],
    }
    ```
    
- **Response  `404`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 404 Not FoundReproxy-Status: yesAccess-Control-Allow-Origin: *Content-Type: application/jsonServer: lighttpdContent-Length: 32Date: Tue, 01 Jul 2014 01:08:31 GMTX-Varnish: 1465587583Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "message": "Artist not found."
    }
    ```
    

## Artist Releases [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Adatabase#page:database,header:database-artist-releases)

Returns a list of Releases and Masters associated with the Artist.  
Accepts [Pagination](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Adatabase#page:home,header:home-pagination).

`/artists/{artist_id}/releases{?sort,sort_order}`

Get an artist’s releases

- **Parameters**
- artist_id
    
    `number` (required) **Example:** 108713
    
    The Artist ID
    
    sort
    
    `string` (optional) **Example:** year
    
    Sort items by this field:  
    `year` (i.e. year of the release)  
    `title` (i.e. title of the release)  
    `format`
    
    sort_order
    
    `string` (optional) **Example:** asc
    
    Sort items in a particular order (one of `asc`, `desc`)
    

- **Response  `200`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 200 OKReproxy-Status: yesAccess-Control-Allow-Origin: *Content-Type: application/jsonServer: lighttpdContent-Length: 1258Date: Tue, 01 Jul 2014 01:06:53 GMTX-Varnish: 1465566651Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "pagination": {
        "per_page": 50,
        "items": 9,
        "page": 1,
        "urls": {},
        "pages": 1
      },
      "releases": [
        {
          "artist": "Nickelback",
          "id": 173765,
          "main_release": 3128432,
          "resource_url": "http://api.discogs.com/masters/173765",
          "role": "Main",
          "thumb": "https://api-img.discogs.com/lb0zp7--FLaRP0LmJ4W6DhfweNc=/fit-in/90x90/filters:strip_icc():format(jpeg):mode_rgb()/discogs-images/R-5557864-1396493975-7618.jpeg.jpg",
          "title": "Curb",
          "type": "master",
          "year": 1996
        },
        {
          "artist": "Nickelback",
          "format": "CD, EP",
          "id": 4299404,
          "label": "Not On Label (Nickelback Self-released)",
          "resource_url": "http://api.discogs.com/releases/4299404",
          "role": "Main",
          "status": "Accepted",
          "thumb": "https://api-img.discogs.com/eFRGD78N7UhtvRjhdLZYXs2QJXk=/fit-in/90x90/filters:strip_icc():format(jpeg):mode_rgb()/discogs-images/R-4299404-1361106117-3632.jpeg.jpg",
          "title": "Hesher",
          "type": "release",
          "year": 1996
        },
        {
          "artist": "Nickelback",
          "id": 173767,
          "main_release": 1905922,
          "resource_url": "http://api.discogs.com/masters/173767",
          "role": "Main",
          "thumb": "https://api-img.discogs.com/12LXbUV44IHjyb6drFZOTQxgCqs=/fit-in/90x90/filters:strip_icc():format(jpeg):mode_rgb()/discogs-images/R-1905922-1251540516.jpeg.jpg",
          "title": "Leader Of Men",
          "type": "master",
          "year": 1999
        }
      ]
    }
    ```
    
- **Response  `404`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 404 Not FoundReproxy-Status: yesAccess-Control-Allow-Origin: *Content-Type: application/jsonServer: lighttpdContent-Length: 32Date: Tue, 01 Jul 2014 01:08:31 GMTX-Varnish: 1465587583Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "message": "Artist not found."
    }
    ```
    

## Label [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Adatabase#page:database,header:database-label)

The Label resource represents a label, company, recording studio, location, or other entity involved with Artists and Releases. Labels were recently expanded in scope to include things that aren’t labels – the name is an artifact of this history.

`/labels/{label_id}`

Get a label

- **Parameters**
- label_id
    
    `number` (required) **Example:** 1
    
    The Label ID
    

- **Response  `200`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 200 OKReproxy-Status: yesAccess-Control-Allow-Origin: *Content-Type: application/jsonServer: lighttpdContent-Length: 2834Date: Tue, 01 Jul 2014 01:16:01 GMTX-Varnish: 1465678820Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "profile": "Classic Techno label from Detroit, USA.\r\n[b]Label owner:[/b] [a=Carl Craig].\r\n",
      "releases_url": "https://api.discogs.com/labels/1/releases",
      "name": "Planet E",
      "contact_info": "Planet E Communications\r\nP.O. Box 27218\r\nDetroit, 48227, USA\r\n\r\np: 313.874.8729 \r\nf: 313.874.8732\r\n\r\nemail: info AT Planet-e DOT net\r\n",
      "uri": "https://www.discogs.com/label/1-Planet-E",
      "sublabels": [
        {
          "resource_url": "https://api.discogs.com/labels/86537",
          "id": 86537,
          "name": "Antidote (4)"
        },
        {
          "resource_url": "https://api.discogs.com/labels/41841",
          "id": 41841,
          "name": "Community Projects"
        }
      ],
      "urls": [
        "http://www.planet-e.net",
        "http://planetecommunications.bandcamp.com",
        "http://twitter.com/planetedetroit"
      ],
      "images": [
        {
          "height": 24,
          "resource_url": "https://api-img.discogs.com/85-gKw4oEXfDp9iHtqtCF5Y_ZgI=/fit-in/132x24/filters:strip_icc():format(jpeg):mode_rgb():quality(96)/discogs-images/L-1-1111053865.png.jpg",
          "type": "primary",
          "uri": "https://api-img.discogs.com/85-gKw4oEXfDp9iHtqtCF5Y_ZgI=/fit-in/132x24/filters:strip_icc():format(jpeg):mode_rgb():quality(96)/discogs-images/L-1-1111053865.png.jpg",
          "uri150": "https://api-img.discogs.com/cYmCut4Yh99FaLFHyoqkFo-Md1E=/fit-in/150x150/filters:strip_icc():format(jpeg):mode_rgb()/discogs-images/L-1-1111053865.png.jpg",
          "width": 132
        }
      ],
      "resource_url": "https://api.discogs.com/labels/1",
      "id": 1,
      "data_quality": "Needs Vote"
    }
    ```
    
- **Response  `404`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 404 Not FoundReproxy-Status: yesAccess-Control-Allow-Origin: *Content-Type: application/jsonServer: lighttpdContent-Length: 30Date: Tue, 01 Jul 2014 01:17:27 GMTX-Varnish: 1465696276Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "message": "Label not found."
    }
    ```
    

## All Label Releases [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Adatabase#page:database,header:database-all-label-releases)

`/labels/{label_id}/releases{?page,per_page}`

Returns a list of Releases associated with the label. Accepts [Pagination](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Adatabase#page:home,header:home-pagination) parameters.

- **Parameters**
- label_id
    
    `number` (required) **Example:** 1
    
    The Label ID
    
    page
    
    `number` (optional) **Example:** 3
    
    The page you want to request
    
    per_page
    
    `number` (optional) **Example:** 25
    
    The number of items per page
    

- **Response  `200`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 200 OKReproxy-Status: yesAccess-Control-Allow-Origin: *Content-Type: application/jsonServer: lighttpdContent-Length: 2834Date: Tue, 01 Jul 2014 01:16:01 GMTX-Varnish: 1465678820Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "pagination": {
        "per_page": 5,
        "pages": 68,
        "page": 1,
        "urls": {
          "last": "https://api.discogs.com/labels/1/releases?per_page=5&page=68",
          "next": "https://api.discogs.com/labels/1/releases?per_page=5&page=2"
        },
        "items": 338
      },
      "releases": [
        {
          "artist": "Andrea Parker",
          "catno": "!K7071CD",
          "format": "CD, Mixed",
          "id": 2801,
          "resource_url": "http://api.discogs.com/releases/2801",
          "status": "Accepted",
          "thumb": "https://api-img.discogs.com/cYmCut4Yh99FaLFHyoqkFo-Md1E=/fit-in/150x150/filters:strip_icc():format(jpeg):mode_rgb()/discogs-images/L-1-1111053865.png.jpg",
          "title": "DJ-Kicks",
          "year": 1998
        },
        {
          "artist": "Naomi Daniel",
          "catno": "2INZ 00140",
          "format": "12\"",
          "id": 65040,
          "resource_url": "http://api.discogs.com/releases/65040",
          "status": "Accepted",
          "thumb": "https://api-img.discogs.com/cYmCut4Yh99FaLFHyoqkFo-Md1E=/fit-in/150x150/filters:strip_icc():format(jpeg):mode_rgb()/discogs-images/L-1-1111053865.png.jpg",
          "title": "Stars",
          "year": 1993
        },
        {
          "artist": "Innerzone Orchestra",
          "catno": "546 137-2",
          "format": "CD, Album, P/Mixed",
          "id": 9922,
          "resource_url": "http://api.discogs.com/releases/9922",
          "status": "Accepted",
          "thumb": "https://api-img.discogs.com/cYmCut4Yh99FaLFHyoqkFo-Md1E=/fit-in/150x150/filters:strip_icc():format(jpeg):mode_rgb()/discogs-images/L-1-1111053865.png.jpg",
          "title": "Programmed",
          "year": 1999
        }
      ]
    }
    ```
    
- **Response  `404`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 404 Not FoundReproxy-Status: yesAccess-Control-Allow-Origin: *Content-Type: application/jsonServer: lighttpdContent-Length: 30Date: Tue, 01 Jul 2014 01:17:27 GMTX-Varnish: 1465696276Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "message": "Label not found."
    }
    ```
    

## Search [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Adatabase#page:database,header:database-search)

Issue a search query to our database. This endpoint accepts [pagination parameters](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Adatabase#page:home,header:home-pagination)

[Authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Adatabase#page:authentication) (as any user) is required.

`/database/search?q={query}&{?type,title,release_title,credit,artist,anv,label,genre,style,country,year,format,catno,barcode,track,submitter,contributor}`

Issue a search query

- **Parameters**
- query
    
    `string` (optional) **Example:** nirvana
    
    Your search query
    
    type
    
    `string` (optional) **Example:** release
    
    String. One of `release`, `master`, `artist`, `label`
    
    title
    
    `string` (optional) **Example:** nirvana - nevermind
    
    Search by combined “Artist Name - Release Title” title field.
    
    release_title
    
    `string` (optional) **Example:** nevermind
    
    Search release titles.
    
    credit
    
    `string` (optional) **Example:** kurt
    
    Search release credits.
    
    artist
    
    `string` (optional) **Example:** nirvana
    
    Search artist names.
    
    anv
    
    `string` (optional) **Example:** nirvana
    
    Search artist ANV.
    
    label
    
    `string` (optional) **Example:** dgc
    
    Search label names.
    
    genre
    
    `string` (optional) **Example:** rock
    
    Search genres.
    
    style
    
    `string` (optional) **Example:** grunge
    
    Search styles.
    
    country
    
    `string` (optional) **Example:** canada
    
    Search release country.
    
    year
    
    `string` (optional) **Example:** 1991
    
    Search release year.
    
    format
    
    `string` (optional) **Example:** album
    
    Search formats.
    
    catno
    
    `string` (optional) **Example:** DGCD-24425
    
    Search catalog number.
    
    barcode
    
    `string` (optional) **Example:** 7 2064-24425-2 4
    
    Search barcodes.
    
    track
    
    `string` (optional) **Example:** smells like teen spirit
    
    Search track titles.
    
    submitter
    
    `string` (optional) **Example:** milKt
    
    Search submitter username.
    
    contributor
    
    `string` (optional) **Example:** jerome99
    
    Search contributor usernames.
    

- **Request**
- ##### Body
    
    ```
    GET https://api.discogs.com/database/search?release_title=nevermind&artist=nirvana&per_page=3&page=1
    ```
    
- **Response  `200`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 200 OKReproxy-Status: yesAccess-Control-Allow-Origin: *Cache-Control: public, must-revalidateContent-Type: application/jsonContent-Encoding: gzipServer: lighttpdContent-Length: 623Date: Tue, 15 Jul 2014 18:44:17 GMTX-Varnish: 1701844380 1701819611Age: 101Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "pagination": {
        "per_page": 3,
        "pages": 66,
        "page": 1,
        "urls": {
          "last": "http://api.discogs.com/database/search?per_page=3&artist=nirvana&release_title=nevermind&page=66",
          "next": "http://api.discogs.com/database/search?per_page=3&artist=nirvana&release_title=nevermind&page=2"
        },
        "items": 198
      },
      "results": [
        {
          "style": [
            "Interview",
            "Grunge"
          ],
          "thumb": "",
          "title": "Nirvana - Nevermind",
          "country": "Australia",
          "format": [
            "DVD",
            "PAL"
          ],
          "uri": "/Nirvana-Nevermind-Classic-Albums/release/2028757",
          "community": {
            "want": 1,
            "have": 5
          },
          "label": [
            "Eagle Vision",
            "Rajon Vision",
            "Classic Albums"
          ],
          "catno": "RV0296",
          "year": "2005",
          "genre": [
            "Non-Music",
            "Rock"
          ],
          "resource_url": "http://api.discogs.com/releases/2028757",
          "type": "release",
          "id": 2028757
        },
        {
          "style": [
            "Interview",
            "Grunge"
          ],
          "thumb": "",
          "title": "Nirvana - Nevermind",
          "country": "France",
          "format": [
            "DVD",
            "PAL"
          ],
          "uri": "/Nirvana-Nevermind-Classic-Albums/release/1852962",
          "community": {
            "want": 4,
            "have": 21
          },
          "label": [
            "Eagle Vision",
            "Classic Albums"
          ],
          "catno": "EV 426200",
          "year": "2005",
          "genre": [
            "Non-Music",
            "Rock"
          ],
          "resource_url": "http://api.discogs.com/releases/1852962",
          "type": "release",
          "id": 1852962
        },
        {
          "style": [
            "Hard Rock",
            "Classic Rock"
          ],
          "thumb": "",
          "format": [
            "UMD"
          ],
          "country": "Europe",
          "barcode": [
            "5 034504 843646"
          ],
          "uri": "/Nirvana-Nevermind/release/3058947",
          "community": {
            "want": 10,
            "have": 3
          },
          "label": [
            "Eagle Vision"
          ],
          "catno": "ERUMD436",
          "genre": [
            "Rock"
          ],
          "title": "Nirvana - Nevermind",
          "resource_url": "http://api.discogs.com/releases/3058947",
          "type": "release",
          "id": 3058947
        }
      ]
    }
    ```
    
- **Response  `500`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 500 Server ErrorReproxy-Status: yesAccess-Control-Allow-Origin: *Content-Type: application/jsonServer: lighttpdContent-Length: 32Date: Tue, 01 Jul 2014 01:08:31 GMTX-Varnish: 1465587583Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "message": "Query time exceeded. Please try a simpler query."
    }
    ```
    
- **Response  `500`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 500 Server ErrorReproxy-Status: yesAccess-Control-Allow-Origin: *Content-Type: application/jsonServer: lighttpdContent-Length: 32Date: Tue, 01 Jul 2014 01:08:31 GMTX-Varnish: 1465587583Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "message": "An internal server error occurred. (Malformed query?)"
    }
    ```
    

## Videos [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Adatabase#page:database,header:database-videos)

If your application integrates YouTube videos, then third party cookies may be used. You can view YouTube and Google’s cookie policy [here](https://www.google.com/policies/technologies/cookies/).