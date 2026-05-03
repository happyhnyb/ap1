# Hexo Integration

This repo now uses Hexo as a content-generation layer without replacing the current Next.js product UI.

What stays the same:

- The public UI remains the current Next.js app.
- AI onboarding, summaries, and predictor routes stay in the existing app.
- The Mac mini remains the primary backend source for live editorial content.

What Hexo now does:

- Exports article content into a Hexo-compatible `_posts` workspace.
- Generates static JSON snapshots from that content.
- Feeds `data/fallback/posts-snapshot.json`, which the app can use when the Mac mini backend is unreachable.

Main commands:

```bash
npm run hexo:export
npm run hexo:generate
npm run hexo:build
```

Recommended production flow:

1. Pull posts from the Mac mini backend.
2. Run `npm run hexo:build`.
3. Deploy the Next frontend with the refreshed fallback snapshot.

Directory overview:

- `hexo-site/`: Hexo workspace and generated public artifacts
- `scripts/export-posts-to-hexo.ts`: writes current posts into `hexo-site/source/_posts`
- `scripts/generate-hexo-fallback.ts`: runs Hexo and emits static JSON snapshots
- `data/fallback/posts-snapshot.json`: app-side bundled fallback content
