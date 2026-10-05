# Web showcase

A web page that lists Outcome's markets by category. Each market opens on outcome.xyz in a new tab.

## Run

```bash
# In the repository root, build the SDK this example links to.
pnpm install && pnpm build

cd examples/web-showcase
pnpm install
pnpm dev
```

Open http://localhost:5173.

The example targets testnet by default. Mainnet is opt-in with `createHIP4Adapter({ testnet: false })` in
`src/markets.ts`. The outcome.xyz links are for mainnet markets, so use mainnet for links that resolve.

`src/markets.ts` loads the markets, assigns categories and builds the outcome.xyz links. `src/main.ts` renders
the page.

In your own app, install `@outcome.xyz/hip4` from npm in place of the `link:../..` dependency, and replace
`acme-games` in `src/markets.ts` with your brand.
