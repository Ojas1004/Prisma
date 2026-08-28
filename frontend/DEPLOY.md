# Frontend deploy notes — SPA fallback

The app uses **path-based routing** (`/`, `/transform`). Any host serving the
production build must rewrite unknown paths to `index.html`, or a hard refresh
on `/transform` returns 404 while in-app navigation still works.

**The hosting target is not yet decided** (see PROGRESSION.md — deployment is
not started, and Vercel cannot host the FastAPI backend as-is because SSE
streams and asyncio jobs outlive a serverless request). Configs for the likely
static hosts are committed so whichever is chosen works without a rediscovery:

| Host | File | Status |
|---|---|---|
| Vite dev server | built in (`appType: "spa"`) | active — verified |
| Netlify | `public/_redirects` | committed, unverified |
| Vercel | `vercel.json` | committed, unverified |
| nginx | snippet below | not committed |
| GitHub Pages | needs hash routing or a 404.html copy | **not supported as-is** |

Both committed files are inert on any host that does not read them.

## nginx

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

## Apache

```apache
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

## GitHub Pages

Pages has no rewrite support. Either copy `dist/index.html` to `dist/404.html`
as a build step, or switch `BrowserRouter` to `HashRouter` in `src/App.tsx` —
the latter changes every URL to `/#/transform` and should only be done if
Pages is definitely the target.
