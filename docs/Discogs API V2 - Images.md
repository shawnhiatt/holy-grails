[discogs.com](https://www.discogs.com/developers/#page:images)

# Images - Discogs API Documentation

---

The Image resource represents a user-contributed image of a database object, such as Artists or Releases. Image requests require [authentication](about:reader?url=https%3A%2F%2Fwww.discogs.com%2Fdevelopers%2F%23page%3Aimages#page:authentication) and are subject to rate limiting.

It’s unlikely that you’ll ever have to construct an image URL; images keys on other resources use fully-qualified URLs, including hostname and protocol. To retrieve images, authenticate via OAuth or Discogs Auth and fetch the object that contains the image of interest (e.g., the release, user profile, etc.). The image URL will be in the response using the HTTPS protocol, and requesting that URL should succeed.