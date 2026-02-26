[discogs.com](https://www.discogs.com/developers/#page:authentication)

# Authentication - Discogs API Documentation

---

This section describes the various methods of authenticating with the Discogs API.

---

In order to access protected endpoints, you’ll need to register for either a consumer key and secret or user token, depending on your situation:

- To easily access your own user account information, use a **User token**.
    
- To get access to an endpoint that requires authentication and build 3rd party apps, use a **Consumer Key and Secret**.
    

To get one of these, sign up for a Discogs account if you don’t have one already, and go to your [Developer Settings](https://www.discogs.com/settings/developers). From there, you can create a new application/token or edit the metadata for an existing app.

When you create a new application, you’ll be granted a **Consumer Key** and **Consumer Secret**, which you can plug into your application and start making authenticated requests. It’s important that you don’t disclose the Consumer Secret to anyone.

Generating a user token is as easy as clicking the **Generate token** button on the developer settings. Keep this token private, as it allows users to access your information.

---

The OAuth 1.0a flow involves three server-side endpoints:

Request token URL: `https://api.discogs.com/oauth/request_token`  
Authorize URL: `https://www.discogs.com/oauth/authorize`  
Access token URL: `https://api.discogs.com/oauth/access_token`

For convenience, these are also listed on the Edit Application page.

Once authenticated, you can test that everything’s working correctly by requesting the [Identity](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Aauthentication#page:user-identity,header:user-identity-identity) resource.

---

## Discogs Auth Flow [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Aauthentication#page:authentication,header:authentication-discogs-auth-flow)

If you do not plan on building an app which others can log into on their behalf, you should use this authentication method as it is much simpler and is still secure. Discogs Auth requires that requests be made over HTTPS, as you are sending your app’s key/secret or token in the request.  
To send requests with Discogs Auth, you have two options: sending your credentials in the query string with `key` and `secret` parameters or a `token` parameter, for example:

```
curl "https://api.discogs.com/database/search?q=Nirvana&key=foo123&secret=bar456"
```

or

```
curl "https://api.discogs.com/database/search?q=Nirvana&token=abcxyz123456"
```

Your other option is to send your credentials in the request as an `Authorization` header, as follows:

```
curl "https://api.discogs.com/database/search?q=Nirvana" -H "Authorization: Discogs key=foo123, secret=bar456"
```

or

```
curl "https://api.discogs.com/database/search?q=Nirvana" -H "Authorization: Discogs token=abcxyz123456"
```

What differentiates the `key`/`secret` pair option from the `token` option? Let’s look at this table:

|Credentials in request|Rate limiting?|Image URLs?|Authenticated as user?|
|---|---|---|---|
|None|🐢 Low tier|❌ No|❌ No|
|Only Consumer key/secret|🐰 High tier|✔️ Yes|❌ No|
|Full OAuth 1.0a with access token/secret ([see below](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Aauthentication#page:authentication,header:authentication-oauth-flow))|🐰 High tier|✔️ Yes|✔️ Yes, on behalf of any user 🌍|
|Personal access token|🐰 High tier|✔️ Yes|✔️ Yes, for token holder only 👩|

In other words:

- Using the `key` and `secret` will get you [image](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Aauthentication#page:images) URLs. These are unavailable to unauthenticated requests.
    
- Using the `key` and `secret` will up your [rate limit](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Aauthentication#page:home,header:home-rate-limiting), unlike unauthenticated requests.
    
- **BUT** using the `key` and `secret` does **not** identify the requester as any particular user, and as such will **not** grant access to any resources users should be able to see on their own account (e.g. marketplace orders, private inventory fields, private collections). You will need to use either of the `token` options for these resources.
    

That’s it! Continue sending the key/secret pair or user token with the rest of your requests.

---

## OAuth Flow [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Aauthentication#page:authentication,header:authentication-oauth-flow)

OAuth is a protocol that allows users to grant access to their data without having to share their password.

This is an explanation of how a web application may work with Discogs using OAuth 1.0a. We highly suggest you use an [OAuth library/wrapper](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Aauthentication#page:home,header:home-quickstart) to simplify the process of authenticating.

1. Obtain consumer key and consumer secret from Developer Settings

Application registration can be found here: [https://www.discogs.com/settings/developers](https://www.discogs.com/settings/developers)

You only need to register once per application you make. You should not share your consumer secret, as it acts as a sort of password for your requests.

2. Send a GET request to the Discogs request token URL

```
GET https://api.discogs.com/oauth/request_token
```

Include the following headers with your request:

```
Content-Type: application/x-www-form-urlencoded
Authorization:
        OAuth oauth_consumer_key="your_consumer_key",
        oauth_nonce="random_string_or_timestamp",
        oauth_signature="your_consumer_secret&",
        oauth_signature_method="PLAINTEXT",
        oauth_timestamp="current_timestamp",
        oauth_callback="your_callback"
User-Agent: some_user_agent
```

**Note:** using an OAuth library instead of generating these requests manually will likely save you a headache if you are new to OAuth. Please refer to your OAuth library’s documentation if you choose to do so.

As the example shows, we suggest sending requests with HTTPS and the PLAINTEXT signature method over HMAC-SHA1 due to its simple yet secure nature. This involves setting your oauth_signature_method to “PLAINTEXT” and your oauth_signature to be your consumer secret followed by an ampersand (&).

If all goes well with the request, you should get an `HTTP 200 OK` response. If an invalid OAuth request is sent, you will receive an `HTTP 400 Bad Request` response.

Be sure to include a unique User-Agent in the request headers.

A successful request will return a response that contains the following content: OAuth request token (`oauth_token`), an OAuth request token secret (`oauth_token_secret`), and a callback confirmation (`oauth_callback_confirmed`). These will be used in the following steps.

3. Redirect your user to the Discogs Authorize page

Authorization page:

```
https://discogs.com/oauth/authorize?oauth_token=<your_oauth_request_token>
```

This page will ask the user to authorize your app on behalf of their Discogs account. If they accept and authorize, they will receive a verifier key to use as verification. This key is used in the next phase of OAuth authentication.

If you added a callback URL to your Discogs application registration, the user will be redirected to that URL, and you can capture their verifier from the response. The verifier will be used to generate the access token in the next step. You can always edit your application settings to include a callback URL (i.e., you don’t need to re-create a new application).

4. Send a POST request to the Discogs access token URL

```
POST https://api.discogs.com/oauth/access_token
```

Include the following headers in your request:

```
Content-Type: application/x-www-form-urlencoded
Authorization:
        OAuth oauth_consumer_key="your_consumer_key",
        oauth_nonce="random_string_or_timestamp",
        oauth_token="oauth_token_received_from_step_2"
        oauth_signature="your_consumer_secret&",
        oauth_signature_method="PLAINTEXT",
        oauth_timestamp="current_timestamp",
        oauth_verifier="users_verifier"
User-Agent: some_user_agent
```

If the OAuth access token is not created within 15 minutes of when you receive the OAuth request token, your OAuth request token and verifier will expire, and you will need to re-create them. If you try to POST to the access token URL with an expired verifier or your request is malformed, you will receive an HTTP 400 Bad Request response.

As the example shows, we suggest sending requests with HTTPS and the PLAINTEXT signature method over HMAC-SHA1 due to its simple yet secure nature. This involves setting your oauth_signature_method to “PLAINTEXT” and your oauth_signature to be your consumer secret followed by an ampersand (&).

Be sure to include a unique User-Agent in the header.

A successful request will return a response that contains an OAuth access token (`oauth_token`) and an OAuth access token secret (`oauth_token_secret`). These tokens do not expire (unless the user revokes access from your app), so you should store these tokens in a database or persistent storage to make future requests signed with OAuth. All requests that require OAuth will require these two tokens to be sent in the request.

5. Send authenticated requests to Discogs endpoints

You are now ready to send authenticated requests with Discogs through OAuth. Be sure to attach the user’s OAuth access token and OAuth access token secret to each request.

To test that you are ready to send authenticated requests, send a GET request to the identity URL. A successful request will yield a response that contains information about the authenticated user.

```
GET https://api.discogs.com/oauth/identity
```

---

### Request Token URL [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Aauthentication#page:authentication,header:authentication-request-token-url)

Generate the request token

`/oauth/request_token`

- **Request**
- ##### Headers
    
    ```
    Content-Type: application/x-www-form-urlencodedAuthorization: OAuth oauth_consumer_key="your_consumer_key", oauth_nonce="random_string_or_timestamp", oauth_signature="your_consumer_secret&", oauth_signature_method="PLAINTEXT", oauth_timestamp="current_timestamp", oauth_callback="your_callback"User-Agent: some_user_agent
    ```
    
- **Response  `200`**
- ##### Headers
    
    ```
    oauth_token: abc123oauth_token_secret: xyz789oauth_callback_confirmed: 'true'
    ```
    

### Access Token URL [](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Aauthentication#page:authentication,header:authentication-access-token-url)

Generate the access token

`/oauth/access_token`

- **Request**
- ##### Headers
    
    ```
    Content-Type: application/x-www-form-urlencodedAuthorization: OAuth oauth_consumer_key="your_consumer_key", oauth_nonce="random_string_or_timestamp", oauth_token="oauth_token_received_from_step_2" oauth_signature="your_consumer_secret&", oauth_signature_method="PLAINTEXT", oauth_timestamp="current_timestamp", oauth_verifier="users_verifier"User-Agent: some_user_agent
    ```
    
- **Response  `200`**
- ##### Headers
    
    ```
    oauth_token: abc123oauth_token_secret: xyz789
    ```