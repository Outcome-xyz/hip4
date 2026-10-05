# Web trading

A web page where users trade Outcome's markets: order book, wallet connection, approvals, orders, positions
and open orders.

## Run

```bash
# In the repository root, build the SDK this example links to.
pnpm install && pnpm build

cd examples/web-trading
pnpm install
pnpm dev
```

Open http://localhost:5173 in a browser with a wallet extension such as MetaMask or Rabby.

`src/markets.ts` loads the markets and assigns categories. `src/trading.ts` connects the wallet, approves the
agent key and builder fee, and moves USDC to spot. `src/main.ts` renders the page and places and cancels orders.

To charge a builder fee, set `BUILDER` in `src/trading.ts`. In your own app, install `@outcome.xyz/hip4` from
npm in place of the `link:../..` dependency.
