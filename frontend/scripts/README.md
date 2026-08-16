# Frontend scripts

## `figma-account-diff.mjs`

Compares Figma Account & Security frames (`30:129`, `30:2`, `30:279`, `30:314`) against the copy wired in `account-pages.ts`.

**Requires** a Figma personal access token in the environment. **Never commit** the token to git.

```bash
export FIGMA_TOKEN="figd_..."
node scripts/figma-account-diff.mjs
```

Requests are throttled (~1.2s apart) to avoid Figma API rate limits.
