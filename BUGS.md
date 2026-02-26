# Known Issues

## Fix before Phase 5 (market data wiring)

**price_suggestions response shape**

`discogs-api.ts` ~line 548. The Discogs API returns a keyed object, not
an array:

```json
{
  "Mint (M)": { "currency": "USD", "value": 14.32 },
  "Near Mint (NM or M-)": { "currency": "USD", "value": 12.81 }
}
```

Use `Object.entries(data)` to build `ConditionPrice[]`. Also handle an
empty object `{}` gracefully — returned when the user has no seller
settings configured. Must not throw.

**marketplace/stats field names**

`discogs-api.ts` ~line 427. API returns snake_case nested fields:

```json
{
  "lowest_price": { "currency": "USD", "value": 2.09 },
  "num_for_sale": 26,
  "blocked_from_sale": false
}
```

Current `MarketplaceStats` interface assumes flat camelCase. Update the
interface to match. Also add `blocked_from_sale: boolean` — when `true`,
both `lowest_price` and `num_for_sale` return as null.

## Low priority / fix when convenient

**DiscogsWant.date_added**

`discogs-api.ts` ~line 361. `date_added` does not exist in the Discogs
wantlist response. Remove the field from the `DiscogsWant` interface.
No runtime impact — the field is never accessed.

**CollectionValue.currency**

`discogs-api.ts` ~line 413. The `currency` field on `CollectionValue`
implies it comes from the API, but the collection value endpoint does not
return a currency field. The value is always the hardcoded fallback `"USD"`.
Update the interface comment to reflect this.

**username URL-encoding inconsistency**

Some functions use `encodeURIComponent(username)` in endpoint URLs,
others use raw template literal interpolation. Discogs usernames are
alphanumeric + `_`, `-`, `.` only, so there is no current user impact —
but the inconsistency should be normalized. All URL interpolations of
`username` should use `encodeURIComponent(username)`.
