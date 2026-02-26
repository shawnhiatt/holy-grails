[discogs.com](https://www.discogs.com/developers/#page:home)

# Home - Discogs API Documentation

---

Here’s your place to code all things Discogs! The Discogs API lets developers build their own Discogs-powered applications for the web, desktop, and mobile devices. We hope the API will connect and empower a community of music lovers around the world!

The Discogs API v2.0 is a RESTful interface to Discogs data. You can access JSON-formatted information about Database objects such as Artists, Releases, and Labels. Your application can also manage User Collections and Wantlists, create Marketplace Listings, and more.

Some Discogs data is made available under the [CC0 No Rights Reserved](http://creativecommons.org/about/cc0) license, and some is restricted data, as defined in our [API Terms of Use.](https://support.discogs.com/hc/articles/360009334593-API-Terms-of-Use)

Our [monthly data dumps](https://www.discogs.com/data/) are available under the the CC0 No Rights Reserved license.

If you utilize the Discogs API, you are subject to the [API Terms of Use.](https://support.discogs.com/hc/articles/360009334593-API-Terms-of-Use) Please also ensure that any application you develop follows the Discogs [Application Name and Description Policy.](https://www.discogs.com/help/doc/naming-your-application)

---

## Quickstart [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Ahome#page:home,header:home-quickstart)

If you just want to see some results right now, issue this curl command:

```
curl https://api.discogs.com/releases/249504 --user-agent "FooBarApp/3.0"
```

For community-maintained client libraries and example code, see the links below:

|Language|Type|Maintainer|URL|
|---|---|---|---|
|Node.js|Client|bartve|[https://github.com/bartve/disconnect](https://github.com/bartve/disconnect)|
|PHP|Client|ricbra|[https://github.com/ricbra/php-discogs-api](https://github.com/ricbra/php-discogs-api)|
|Python|Client|joalla|[https://github.com/joalla/discogs_client](https://github.com/joalla/discogs_client)|
|Python|Example|jesseward|[https://github.com/jesseward/discogs-oauth-example](https://github.com/jesseward/discogs-oauth-example)|
|Ruby|Client|buntine|[https://github.com/buntine/discogs](https://github.com/buntine/discogs)|

---

## General Information [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Ahome#page:home,header:home-general-information)

**Your application must provide a User-Agent string that identifies itself** – preferably something that follows [RFC 1945](http://tools.ietf.org/html/rfc1945#section-3.7). Some good examples include:

```
AwesomeDiscogsBrowser/0.1 +http://adb.example.com
LibraryMetadataEnhancer/0.3 +http://example.com/lime
MyDiscogsClient/1.0 +http://mydiscogsclient.org
```

Please don’t just copy one of those! Make it unique so we can let you know if your application starts to misbehave – the alternative is that we just silently block it, which will confuse and infuriate your users.

Here are some bad examples that are unclear or obscure the nature of the application:

```
curl/7.9.8 (i686-pc-linux-gnu) libcurl 7.9.8 (OpenSSL 0.9.6b)
Mozilla/5.0 (X11; Linux i686; rv:6.0.2) Gecko/20100101 Firefox/6.0.2
my app
```

When a callback query string parameter is supplied, the API can return responses in JSONP format.

JSONP, by its nature, cannot access HTTP information like headers or the status code, so the API supplies that information in the response, like so:

```
GET https://api.discogs.com/artists/1?callback=callbackname
```

```
200 OK
Content-Type: text/javascript
```

```
callbackname({
    "meta": { 
        "status": 200, 
    }, 
    "data": {
        "id": 1,
        "name": "Persuader, The"
        // ... and so on 
    } 
})
```

---

## Rate Limiting [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Ahome#page:home,header:home-rate-limiting)

**Requests are throttled by the server by source IP to 60 per minute for authenticated requests, and 25 per minute for unauthenticated requests, with some exceptions.**

Your application should identify itself to our servers via a unique user agent string in order to achieve the maximum number of requests per minute.

Our rate limiting tracks your requests using a moving average over a 60 second window. If no requests are made in 60 seconds, your window will reset.

We attach the following headers to responses to help you track your rate limit use:

`X-Discogs-Ratelimit`: The total number of requests you can make in a one minute window.

`X-Discogs-Ratelimit-Used` : The number of requests you’ve made in your existing rate limit window.

`X-Discogs-Ratelimit-Remaining`: The number of remaining requests you are able to make in the existing rate limit window.

Your application should take our global limit into account and throttle its requests locally.

In the future, we may update these rate limits at any time in order to provide service for all users.

---

Some resources represent collections of objects and may be paginated. By default, 50 items per page are shown.

To browse different pages, or change the number of items per page (up to 100), use the page and per_page query string parameters:

```
GET https://api.discogs.com/artists/1/releases?page=2&per_page=75
```

Responses include a Link header:

```
Link: <https://api.discogs.com/artists/1/releases?page=3&per_page=75>; rel=next,
<https://api.discogs.com/artists/1/releases?page=1&per_page=75>; rel=first,
<https://api.discogs.com/artists/1/releases?page=30&per_page=75>; rel=last,
<https://api.discogs.com/artists/1/releases?page=1&per_page=75>; rel=prev
```

And a pagination object in the response body:

```
{ 
    "pagination": { 
        "page": 2, 
        "pages": 30, 
        "items": 2255, 
        "per_page": 75, 
        "urls":
            { 
                "first": "https://api.discogs.com/artists/1/releases?page=1&per_page=75",
                "prev": "https://api.discogs.com/artists/1/releases?page=1&per_page=75", 
                "next": "https://api.discogs.com/artists/1/releases?page=3&per_page=75", 
                "last": "https://api.discogs.com/artists/1/releases?page=30&per_page=75"
            } 
    }, 
    "releases":
        [ ... ] 
}
```

---

Currently, our API only supports one version: v2. However, you can specify a version in your requests to future-proof your application. By adding an `Accept` header with the version and media type, you can guarantee your requests will receive data from the correct version you develop your app on.

A standard `Accept` header may look like this:  
`application/vnd.discogs.v2.html+json`

If you are requesting information from an endpoint that may have text formatting in it, you can choose which kind of formatting you want to be returned by changing that section of the `Accept` header. We currently support 3 types:  
`application/vnd.discogs.v2.html+json`  
`application/vnd.discogs.v2.plaintext+json`  
`application/vnd.discogs.v2.discogs+json`

If no Accept header is supplied, or if the Accept header differs from one of the three previous options, we default to `application/vnd.discogs.v2.discogs+json`.

---

## FAQ [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Ahome#page:home,header:home-faq)

1. **Why am I getting an empty response from the server?**
    
    This generally happens when you forget to add a User-Agent header to your requests.
    
2. **How do I get updates about the API?**
    
    Subscribe to our [API Announcements forum thread](https://www.discogs.com/forum/thread/521520689469733cfcfd2089). For larger, breaking changes, we will send out an email notice to all developers with a registered Discogs application.
    
3. **Where can I register a Discogs application?**
    
    You can register a Discogs application on the [Developer Settings](https://www.discogs.com/settings/developers).
    
4. **If I have a question/issue with the API, should I file a Support Request?**
    
    It's generally best to start out with a forum post on the [API topic](https://www.discogs.com/forum/topic/1082) since other developers may have had similar issues and can point you in the right direction. If the issue requires privacy, then a support request is the best way to go.
    
5. **I'm getting a 404 response when trying to fetch images; what gives?**
    
    This may seem obvious, but make sure you aren't doing anything to change the URL. The URLs returned are signed URLs, so trying to change one part of the URL (e.g., Release ID number) will generally not work.
    
6. **What are the authentication requirements for requesting images?**
    
    Please see the [Images documentation page](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Ahome#page:images).
    
7. **Why am I getting a particular HTTP response?**
    
    - **200 OK**
        
        The request was successful, and the requested data is provided in the response body.
        
    - **201 Continue**
        
        You’ve sent a POST request to a list of resources to create a new one. The ID of the newly-created resource will be provided in the body of the response.
        
    - **204 No Content**
        
        The request was successful, and the server has no additional information to convey, so the response body is empty.
        
    - **401 Unauthorized**
        
        You’re attempting to access a resource that first requires [authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Ahome#page:authentication). See Authenticating with OAuth.
        
    - **403 Forbidden**
        
        You’re not allowed to access this resource. Even if you authenticated, or already have, you simply don’t have permission. Trying to modify another user’s profile, for example, will produce this error.
        
    - **404 Not Found**
        
        The resource you requested doesn’t exist.
        
    - **405 Method Not Allowed**
        
        You’re trying to use an HTTP verb that isn’t supported by the resource. Trying to PUT to /artists/1, for example, will fail because Artists are read-only.
        
    - **422 Unprocessable Entity**
        
        Your request was well-formed, but there’s something semantically wrong with the body of the request. This can be due to malformed JSON, a parameter that’s missing or the wrong type, or trying to perform an action that doesn’t make any sense. Check the response body for specific information about what went wrong.
        
    - **500 Internal Server Error**
        
        Something went wrong on our end while attempting to process your request. The response body’s message field will contain an error code that you can send to Discogs Support (which will help us track down your specific issue).