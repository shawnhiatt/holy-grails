[discogs.com](https://www.discogs.com/developers/#page:user-identity)

# User Identity - Discogs API Documentation

---

## Identity [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-identity#page:user-identity,header:user-identity-identity)

`/oauth/identity`

Retrieve basic information about the authenticated user.  
You can use this resource to find out who you’re authenticated as, and it also doubles as a good sanity check to ensure that you’re using OAuth correctly.  
For more detailed information, make another request for the user’s Profile.

- **Request**
- ##### Body
    
    ```
    GET https://api.discogs.com/oauth/identity
    ```
    
- **Response  `200`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 200 OKReproxy-Status: yesAccess-Control-Allow-Origin: *Cache-Control: public, must-revalidateContent-Type: application/jsonContent-Encoding: gzipContent-Location: https://api.discogs.com/oauth/identity?oauth_body_hash=some_hash&oauth_nonce=...Server: lighttpdContent-Length: 127Date: Tue, 15 Jul 2014 18:44:17 GMTX-Varnish: 1718276369Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "id": 1,
      "username": "example",
      "resource_url": "https://api.discogs.com/users/example",
      "consumer_name": "Your Application Name"
    }
    ```
    
- **Response  `401`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 401 UnauthorizedReproxy-Status: yesAccess-Control-Allow-Origin: *Cache-Control: public, must-revalidateContent-Type: application/jsonWWW-Authenticate: OAuth realm="https://api.discogs.com"Server: lighttpdContent-Length: 61Date: Wed, 16 Jul 2014 18:42:38 GMTX-Varnish: 1718433436Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "message": "You must authenticate to access this resource."
    }
    ```
    

## Profile [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-identity#page:user-identity,header:user-identity-profile)

`/users/{username}`

Retrieve a user by username.  
If authenticated as the requested user, the `email` key will be visible, and the `num_list` count will include the user’s private lists.  
If authenticated as the requested user or the user’s collection/wantlist is public, the `num_collection` / `num_wantlist` keys will be visible.

- **Parameters**
- username
    
    `string` (required) **Example:** rodneyfool
    
    The username of whose profile you are requesting.
    

- **Response  `200`**
- ##### Headers
    
    ```
    Status: HTTP/1.1 200 OKReproxy-Status: yesAccess-Control-Allow-Origin: *Cache-Control: public, must-revalidateContent-Type: application/jsonServer: lighttpdContent-Length: 858Date: Wed, 16 Jul 2014 18:46:21 GMTX-Varnish: 1718492795Age: 0Via: 1.1 varnishConnection: keep-alive
    ```
    
    ##### Body
    
    ```
    {
      "profile": "I am a software developer for Discogs.\r\n\r\n[img=http://i.imgur.com/IAk3Ukk.gif]",
      "wantlist_url": "https://api.discogs.com/users/rodneyfool/wants",
      "rank": 149,
      "num_pending": 61,
      "id": 1578108,
      "num_for_sale": 0,
      "home_page": "",
      "location": "I live in the good ol' Pacific NW",
      "collection_folders_url": "https://api.discogs.com/users/rodneyfool/collection/folders",
      "username": "rodneyfool",
      "collection_fields_url": "https://api.discogs.com/users/rodneyfool/collection/fields",
      "releases_contributed": 5,
      "registered": "2012-08-15T21:13:36-07:00",
      "rating_avg": 3.47,
      "num_collection": 78,
      "releases_rated": 116,
      "num_lists": 0,
      "name": "Rodney",
      "num_wantlist": 160,
      "inventory_url": "https://api.discogs.com/users/rodneyfool/inventory",
      "avatar_url": "http://www.gravatar.com/avatar/55502f40dc8b7c769880b10874abc9d0?s=52&r=pg&d=mm",
      "banner_url": "https://img.discogs.com/dhuJe-pRJmod7hN3cdVi2PugEh4=/1600x400/filters:strip_icc():format(jpeg)/discogs-banners/B-1578108-user-1436314164-9231.jpg.jpg",
      "uri": "https://www.discogs.com/user/rodneyfool",
      "resource_url": "https://api.discogs.com/users/rodneyfool",
      "buyer_rating": 100.00,
      "buyer_rating_stars": 5,
      "buyer_num_ratings": 144,
      "seller_rating": 100.00,
      "seller_rating_stars": 5,
      "seller_num_ratings": 21,
      "curr_abbr": "USD",
    }
    ```
    

`/users/{username}`

Edit a user’s profile data.

[Authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-identity#page:authentication) as the user is required.

- **Parameters**
- username
    
    `string` (required) **Example:** vreon
    
    The username of the user.
    
    name
    
    `string` (optional) **Example:** Nicolas Cage
    
    The real name of the user.
    
    home_page
    
    `string` (optional) **Example:** www.discogs.com
    
    The user’s website.
    
    location
    
    `string` (optional) **Example:** Portland
    
    The geographical location of the user.
    
    profile
    
    `string` (optional) **Example:** I am a Discogs user!
    
    Biographical information about the user.
    
    curr_abbr
    
    `string` (optional) **Example:** USD
    
    Currency for marketplace data. Must be one of the following:  
    `USD` `GBP` `EUR` `CAD` `AUD` `JPY` `CHF` `MXN` `BRL` `NZD` `SEK` `ZAR`
    

- **Response  `200`**
- ##### Body
    
    ```
    {
      "id": 1,
      "username": "example",
      "name": "Example Sampleman",
      "email": "sampleman@example.com",
      "resource_url": "https://api.discogs.com/users/example",
      "inventory_url": "https://api.discogs.com/users/example/inventory",
      "collection_folders_url": "https://api.discogs.com/users/example/collection/folders",
      "collection_fields_url": "https://api.discogs.com/users/example/collection/fields",
      "wantlist_url": "https://api.discogs.com/users/example/wants",
      "uri": "https://www.discogs.com/user/example",
      "profile": "This is some [b]different sample[/b] data!",
      "home_page": "http://www.example.com",
      "location": "Australia",
      "registered": "2011-08-30 14:21:45-07:00",
      "num_lists": 0,
      "num_for_sale": 6,
      "num_collection": 4,
      "num_wantlist": 5,
      "num_pending": 10,
      "releases_contributed": 15,
      "rank": 30,
      "releases_rated": 4,
      "rating_avg": 2.5
    }
    ```
    
- **Response  `403`**
- ##### Body
    
    ```
    {
      "message": "You don't have permission to access this resource."
    }
    ```
    

## User Submissions [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-identity#page:user-identity,header:user-identity-user-submissions)

The Submissions resource represents all edits that a user makes to releases, labels, and artist.

`/users/{username}/submissions`

Retrieve a user’s submissions by username. Accepts [Pagination](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-identity#page:home,header:home-pagination) parameters.

- **Parameters**
- username
    
    `string` (required) **Example:** shooezgirl
    
    The username of the submissions you are trying to fetch.
    

- **Response  `200`**
- ##### Body
    
    ```
    {
      "pagination": {
        "items": 3,
        "page": 1,
        "pages": 1,
        "per_page": 50,
        "urls": {}
      },
      "submissions": {
        "artists": [
          {
            "data_quality": "Needs Vote",
            "id": 240177,
            "name": "Grimy",
            "namevariations": [
              "Grimmy"
            ],
            "releases_url": "https://api.discogs.com/artists/240177/releases",
            "resource_url": "https://api.discogs.com/artists/240177",
            "uri": "https://www.discogs.com/artist/240177-Grimy"
          }
        ],
        "labels": [],
        "releases": [
          {
            "artists": [
              {
                "anv": "",
                "id": 17035,
                "join": "",
                "name": "Chaka Khan",
                "resource_url": "https://api.discogs.com/artists/17035",
                "role": "",
                "tracks": ""
              }
            ],
            "community": {
              "contributors": [
                {
                  "resource_url": "https://api.discogs.com/users/shooezgirl",
                  "username": "shooezgirl"
                },
                {
                  "resource_url": "https://api.discogs.com/users/Diognes_The_Fox",
                  "username": "Diognes_The_Fox"
                }
              ],
              "data_quality": "Needs Vote",
              "have": 0,
              "rating": {
                "average": 0,
                "count": 0
              },
              "status": "Accepted",
              "submitter": {
                "resource_url": "https://api.discogs.com/users/shooezgirl",
                "username": "shooezgirl"
              },
              "want": 0
            },
            "companies": [],
            "country": "US",
            "data_quality": "Needs Vote",
            "date_added": "2014-03-25T14:52:18-07:00",
            "date_changed": "2014-05-14T13:28:21-07:00",
            "estimated_weight": 60,
            "format_quantity": 1,
            "formats": [
              {
                "descriptions": [
                  "7\"",
                  "45 RPM",
                  "Promo"
                ],
                "name": "Vinyl",
                "qty": "1"
              }
            ],
            "genres": [
              "Funk / Soul"
            ],
            "id": 5531861,
            "images": [
              {
                "height": 594,
                "resource_url": "https://api-img.discogs.com/i3jf6S4S7LMNBuWxstCxAQs2Rw0=/fit-in/600x594/filters:strip_icc():format(jpeg):mode_rgb():quality(96)/discogs-images/R-5531861-1400099290-9223.jpeg.jpg",
                "type": "primary",
                "uri": "https://api-img.discogs.com/i3jf6S4S7LMNBuWxstCxAQs2Rw0=/fit-in/600x594/filters:strip_icc():format(jpeg):mode_rgb():quality(96)/discogs-images/R-5531861-1400099290-9223.jpeg.jpg",
                "uri150": "https://api-img.discogs.com/xMSwaqP2T8SNwDUTO-gXmHXWt6s=/fit-in/150x150/filters:strip_icc():format(jpeg):mode_rgb()/discogs-images/R-5531861-1400099290-9223.jpeg.jpg",
                "width": 600
              },
              {
                "height": 600,
                "resource_url": "https://api-img.discogs.com/sT0plDMoOcfJz-1JEui8XQr69kw=/fit-in/600x600/filters:strip_icc():format(jpeg):mode_rgb():quality(96)/discogs-images/R-5531861-1400099290-9749.jpeg.jpg",
                "type": "secondary",
                "uri": "https://api-img.discogs.com/sT0plDMoOcfJz-1JEui8XQr69kw=/fit-in/600x600/filters:strip_icc():format(jpeg):mode_rgb():quality(96)/discogs-images/R-5531861-1400099290-9749.jpeg.jpg",
                "uri150": "https://api-img.discogs.com/f2QfdjBjpuP-Eht4DVSlCfPtTe8=/fit-in/150x150/filters:strip_icc():format(jpeg):mode_rgb()/discogs-images/R-5531861-1400099290-9749.jpeg.jpg",
                "width": 600
              }
            ],
            "labels": [
              {
                "catno": "7-28671",
                "entity_type": "1",
                "id": 1000,
                "name": "Warner Bros. Records",
                "resource_url": "https://api.discogs.com/labels/1000"
              }
            ],
            "master_id": 174698,
            "master_url": "https://api.discogs.com/masters/174698",
            "notes": "Promotion Not for Sale",
            "released": "1986",
            "released_formatted": "1986",
            "resource_url": "https://api.discogs.com/releases/5531861",
            "series": [],
            "status": "Accepted",
            "styles": [
              "Rhythm & Blues"
            ],
            "thumb": "https://api-img.discogs.com/xMSwaqP2T8SNwDUTO-gXmHXWt6s=/fit-in/150x150/filters:strip_icc():format(jpeg):mode_rgb()/discogs-images/R-5531861-1400099290-9223.jpeg.jpg",
            "title": "Love Of A Lifetime",
            "uri": "https://www.discogs.com/Chaka-Khan-Love-Of-A-Lifetime/release/5531861",
            "videos": [
              {
                "description": "Chaka Khan - Love you all my lifetime (live)",
                "duration": 285,
                "embed": true,
                "title": "Chaka Khan - Love you all my lifetime (live)",
                "uri": "https://www.youtube.com/watch?v=WOrCYzfchTI"
              },
              {
                "description": "Chaka Khan - Love Of A Lifetime [Official Video]",
                "duration": 257,
                "embed": true,
                "title": "Chaka Khan - Love Of A Lifetime [Official Video]",
                "uri": "https://www.youtube.com/watch?v=5K6-q2VqJdE"
              },
              {
                "description": "CHAKA KHAN - COLTRANE DREAMS  ~{The 45 VERSION}~",
                "duration": 151,
                "embed": true,
                "title": "CHAKA KHAN - COLTRANE DREAMS  ~{The 45 VERSION}~",
                "uri": "https://www.youtube.com/watch?v=11eaG7KdS9g"
              }
            ],
            "year": 1986
          }
        ]
      }
    }
    ```
    

## User Contributions [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-identity#page:user-identity,header:user-identity-user-contributions)

The Contributions resource represents releases, labels, and artists submitted by a user.

`/users/{username}/contributions{?sort,sort_order}`

Retrieve a user’s contributions by username. Accepts [Pagination](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Auser-identity#page:home,header:home-pagination) parameters.

Valid `sort` keys are:  
`label`  
`artist`  
`title`  
`catno`  
`format`  
`rating`  
`year`  
`added`

Valid `sort_order` keys are:  
`asc`  
`desc`

- **Parameters**
- username
    
    `string` (required) **Example:** shooezgirl
    
    The username of the submissions you are trying to fetch.
    
    sort
    
    `string` (optional) **Example:** artist
    
    Sort items by this field (see below for all valid `sort` keys.
    
    sort_order
    
    `string` (optional) **Example:** desc
    
    Sort items in a particular order (`asc` or `desc`)
    

- **Response  `200`**
- ##### Body
    
    ```
    {
      "contributions": [
        {
          "artists": [
            {
              "anv": "",
              "id": 17961,
              "join": "And",
              "name": "Cher",
              "resource_url": "https://api.discogs.com/artists/17961",
              "role": "",
              "tracks": ""
            }
          ],
          "community": {
            "contributors": [
              {
                "resource_url": "https://api.discogs.com/users/shooezgirl",
                "username": "shooezgirl"
              },
              {
                "resource_url": "https://api.discogs.com/users/Aquacrash_Dj",
                "username": "Aquacrash_Dj"
              }
            ],
            "data_quality": "Needs Vote",
            "have": 0,
            "rating": {
              "average": 0,
              "count": 0
            },
            "status": "Accepted",
            "submitter": {
              "resource_url": "https://api.discogs.com/users/shooezgirl",
              "username": "shooezgirl"
            },
            "want": 0
          },
          "companies": [],
          "country": "US",
          "data_quality": "Needs Vote",
          "date_added": "2014-03-25T15:16:13-07:00",
          "date_changed": "2014-05-14T13:36:00-07:00",
          "estimated_weight": 60,
          "format_quantity": 1,
          "formats": [
            {
              "descriptions": [
                "7\"",
                "45 RPM",
                "Single",
                "Promo"
              ],
              "name": "Vinyl",
              "qty": "1"
            }
          ],
          "genres": [
            "Rock",
            "Pop"
          ],
          "id": 5531933,
          "images": [
            {
              "height": 605,
              "resource_url": "https://api-img.discogs.com/e0X1tNZv6nkdOOTPJAn-dtCbFa0=/fit-in/600x605/filters:strip_icc():format(jpeg):mode_rgb():quality(96)/discogs-images/R-5531933-1400099758-6444.jpeg.jpg",
              "type": "primary",
              "uri": "https://api-img.discogs.com/e0X1tNZv6nkdOOTPJAn-dtCbFa0=/fit-in/600x605/filters:strip_icc():format(jpeg):mode_rgb():quality(96)/discogs-images/R-5531933-1400099758-6444.jpeg.jpg",
              "uri150": "https://api-img.discogs.com/8et0xtf9REFloKoqi6NSJ6AJvFI=/fit-in/150x150/filters:strip_icc():format(jpeg):mode_rgb()/discogs-images/R-5531933-1400099758-6444.jpeg.jpg",
              "width": 600
            }
          ],
          "labels": [
            {
              "catno": "7-27529-DJ",
              "entity_type": "1",
              "id": 821,
              "name": "Geffen Records",
              "resource_url": "https://api.discogs.com/labels/821"
            }
          ],
          "master_id": 223379,
          "master_url": "https://api.discogs.com/masters/223379",
          "notes": "Promotion Not For Sale",
          "released": "1989",
          "released_formatted": "1989",
          "resource_url": "https://api.discogs.com/releases/5531933",
          "series": [],
          "status": "Accepted",
          "styles": [
            "Ballad"
          ],
          "thumb": "https://api-img.discogs.com/8et0xtf9REFloKoqi6NSJ6AJvFI=/fit-in/150x150/filters:strip_icc():format(jpeg):mode_rgb()/discogs-images/R-5531933-1400099758-6444.jpeg.jpg",
          "title": "After All",
          "uri": "https://www.discogs.com/Cher-And-Peter-Cetera-After-All/release/5531933",
          "videos": [
            {
              "description": "Cher & Peter Cetera - After All [On-Screen Lyrics]",
              "duration": 247,
              "embed": true,
              "title": "Cher & Peter Cetera - After All [On-Screen Lyrics]",
              "uri": "https://www.youtube.com/watch?v=qy717J3Iscw"
            }
          ],
          "year": 1989
        }
      ],
      "pagination": {
        "items": 2,
        "page": 1,
        "pages": 1,
        "per_page": 50,
        "urls": {}
      }
    }
    ```