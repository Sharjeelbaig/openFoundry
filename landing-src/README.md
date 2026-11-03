# Landing page

The public page at https://openfoundry.pages.dev. It is separate from the
workspace app in `src/`. The deployable output is `landing/`: one HTML file plus
an assets folder.

## Build

```bash
npm run landing:build
```

The source is in `landing-src/`. The build compiles the Fluent UI React page,
pre-renders it to HTML, and copies the screenshots from `landing-src/screens/`.
The macOS download URL, size and SHA-256 come from `landing-src/release.json`.

The docs screen is a separate page in the same site: `landing/docs/`. Its lessons
and copy live in `landing-src/docs-content.tsx`, the Learn-style shell in
`landing-src/docs-app.tsx`. Screenshots go in `landing-src/screens/` and are copied
by the build.

## Preview

```bash
npm run landing:serve
```

Open http://localhost:4321.

## Deploy

```bash
npm run landing:deploy
```

This uploads `landing/` to the Cloudflare Pages project `openfoundry`.
