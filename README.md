# Heaviest Sack — Shared Backend

This is a small Netlify Function that acts as the single source of truth for the
Heaviest Sack tracker, so the tracker and display widgets show identical data no
matter which machine/editor they're running on.

## Deploying

Since this includes a dependency (`@netlify/blobs`), it needs to be deployed via
git + Netlify's dashboard (drag-and-drop won't run `npm install`).

1. Create a new GitHub repo and push this folder's contents to it.
2. In the Netlify dashboard: **Add new site → Import an existing project → GitHub**,
   and pick the repo.
3. Build settings should auto-detect from `netlify.toml` — publish directory `public`,
   functions directory `netlify/functions`. Leave build command blank (Netlify installs
   dependencies automatically).
4. Deploy. Once live, your endpoint is:
   `https://<your-site-name>.netlify.app/.netlify/functions/sack`
5. **Enable Blobs** if prompted — Site settings → should be on by default for new sites,
   but check under Site configuration → Environment/Blobs if you get storage errors.

## Endpoint

- `GET  /.netlify/functions/sack?streamID=stream-001` → returns `{ donors: {...} }`
- `POST /.netlify/functions/sack` → body is one of:
  - `{ streamID, kind: 'cheer', user, bits, msgId }`
  - `{ streamID, kind: 'sub', user, plan, count, msgId }`
  - `{ streamID, kind: 'subgift' | 'submysterygift', user, plan, count, giftId }`
  - `{ streamID, kind: 'manual', user, type, amount, id }`
  - All POSTs can optionally include `tier1Bits`, `tier2Bits`, `tier3Bits`,
    `tier1Dollars`, `tier2Dollars`, `tier3Dollars` to override the tier conversion
    defaults (258/417/1205 bits, $3.60/$5.82/$16.81).

Once deployed, paste the endpoint URL into the `API_URL` variable on both the
tracker and display Pogly widgets.
