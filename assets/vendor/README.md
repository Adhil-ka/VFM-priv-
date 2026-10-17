# Vendored third-party code

Third-party code is committed here rather than installed from a CDN so that:

- `script-src 'self'` in `server.mjs` stays strict (no external origins are trusted).
- The prototype keeps working fully offline, which matters for a privacy-first product.
- `node server.mjs` remains the only requirement — there is no install step and no
  `node_modules` directory.

## `@formkit/auto-animate`

| Field | Value |
| --- | --- |
| Package | `@formkit/auto-animate` |
| Version | `0.10.0` |
| License | MIT (see `auto-animate.LICENSE`) |
| Copyright | 2022 FormKit Inc. |
| File used | `auto-animate.mjs` (vanilla build, self-contained, no dependencies) |

Used for FLIP-style animation of DOM mutations: view switches, table re-sorting,
timeline insertion, and vital reordering.

The file is vendored **unmodified** so its integrity can be verified against the
published package. To upgrade, replace `auto-animate.mjs` and update the table above.
