import "./style.css";
import { parseSideCoin, stripZeros } from "@outcome.xyz/hip4";
import type { HIP4Market, HLOutcomeTemplate } from "@outcome.xyz/hip4";
import type { WalletClient } from "viem";
import { CATEGORIES, categoryOf, hip4, loadEvents } from "./markets";
import { BUILDER, accountProblem, connectWallet, enableTrading, moveToSpot, usdcInPerps } from "./trading";

const accountBox = document.querySelector<HTMLElement>("#account")!;
const nav = document.querySelector<HTMLElement>("#categories")!;
const list = document.querySelector<HTMLElement>("#events")!;
const panel = document.querySelector<HTMLElement>("#market")!;
const portfolio = document.querySelector<HTMLElement>("#portfolio")!;
const status = document.querySelector<HTMLElement>("#status")!;

let events: HIP4Market[][] = [];
let mids: Record<string, string> = {};
let templates: HLOutcomeTemplate[] = [];
let category = "all";
let selected: { id: number; option: number; side: number } | null = null;

let wallet: WalletClient | null = null;
let problem: string | null = null;
let ready = false;
let perps = "0";
let accountError = "";

const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });
const centsFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function button(label: string, onClick: () => void, active = false): HTMLButtonElement {
  return el("button", { type: "button", textContent: label, className: active ? "active" : "", onclick: onClick });
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const price = (coin: string) => (mids[coin] ? percent.format(Number(mids[coin])) : "-");
const cents = (value: string) => `${centsFormat.format(Number(value) * 100)}c`;
const titleOf = (market: HIP4Market) => ("questionName" in market ? market.questionName : market.name);
const current = () => events.find((options) => options[0]!.outcomeId === selected?.id);

/** A price typed in cents, "61.5", as the order price "0.615". */
function centsToPrice(input: string): string | null {
  const match = /^(\d{1,2})(?:\.(\d{1,3}))?$/.exec(input.trim());
  if (!match) return null;
  const value = `0.${match[1]!.padStart(2, "0")}${match[2] ?? ""}`.replace(/\.?0+$/, "");
  return value === "0" ? null : value;
}

function renderEvents(): void {
  nav.replaceChildren(
    ...["all", ...CATEGORIES].map((c) =>
      button(c, () => {
        category = c;
        renderEvents();
      }, c === category),
    ),
  );
  const shown = category === "all" ? events : events.filter((e) => categoryOf(e[0]!, templates) === category);
  list.replaceChildren(
    ...shown.map((options) =>
      el(
        "button",
        {
          type: "button",
          className: options[0]!.outcomeId === selected?.id ? "row active" : "row",
          onclick: () => select(options),
        },
        el("span", {}, titleOf(options[0]!)),
        el("b", {}, options.length === 1 ? price(options[0]!.sides[0].coin) : `${options.length} options`),
      ),
    ),
  );
  status.textContent = shown.length === 0 ? "No markets in this category right now." : "";
}

function select(options: HIP4Market[]): void {
  selected = { id: options[0]!.outcomeId, option: 0, side: 0 };
  renderEvents();
  renderMarket();
  panel.scrollIntoView({ block: "start", behavior: "smooth" });
}

const book = el("div", { className: "book" });

function choose(option: number, side: number): void {
  if (!selected) return;
  selected = { ...selected, option, side };
  renderMarket();
}

function renderMarket(): void {
  const options = current();
  if (!selected || !options) return panel.replaceChildren();
  const { option, side } = selected;
  panel.replaceChildren(
    el("h2", {}, titleOf(options[0]!)),
    options.length > 1
      ? el("div", { className: "choices" }, ...options.map((m, i) => button(m.name, () => choose(i, 0), i === option)))
      : "",
    el(
      "div",
      { className: "choices" },
      ...options[option]!.sides.map((s, i) => button(`${s.name} ${price(s.coin)}`, () => choose(option, i), i === side)),
    ),
    book,
    ticket(),
  );
  book.replaceChildren("Loading order book...");
  void refreshBook();
}

async function refreshBook(): Promise<void> {
  const market = current()?.[selected?.option ?? 0];
  if (!selected || !market) return;
  const { id, option, side } = selected;
  try {
    const levels = await hip4.marketData.fetchOrderBook(String(market.outcomeId), side);
    if (selected?.id !== id || selected.option !== option || selected.side !== side) return;
    const row = (kind: string, l: { price: string; size: string }) =>
      el("div", { className: kind }, el("span", {}, cents(l.price)), el("span", {}, stripZeros(l.size)));
    book.replaceChildren(
      el("div", { className: "head" }, el("span", {}, "Price"), el("span", {}, "Shares")),
      ...levels.asks.slice(0, 5).reverse().map((l) => row("ask", l)),
      ...levels.bids.slice(0, 5).map((l) => row("bid", l)),
    );
  } catch (err) {
    book.replaceChildren(`Could not load the order book: ${message(err)}`);
  }
}

function ticket(): HTMLFormElement {
  const action = el("select", {}, el("option", { value: "buy" }, "Buy"), el("option", { value: "sell" }, "Sell"));
  const type = el("select", {}, el("option", { value: "market" }, "Market"), el("option", { value: "limit" }, "Limit"));
  const shares = el("input", { inputMode: "numeric", placeholder: "Shares" });
  const limit = el("input", { inputMode: "decimal", placeholder: "Price in cents", hidden: true });
  const submit = el("button", { type: "submit", textContent: "Place order" });
  const note = el("p", { className: "note" });
  type.onchange = () => (limit.hidden = type.value !== "limit");

  const form = el("form", { className: "ticket" }, action, type, shares, limit, submit, note);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const market = current()?.[selected?.option ?? 0];
    if (!selected || !market) return;
    if (!ready) return void (note.textContent = "Connect your wallet and enable trading first.");
    if (!/^[1-9]\d*$/.test(shares.value.trim())) return void (note.textContent = "Shares must be a whole number.");
    const limitPrice = type.value === "limit" ? centsToPrice(limit.value) : undefined;
    if (limitPrice === null) return void (note.textContent = "Enter a price between 0.001 and 99.999 cents.");

    submit.disabled = true;
    note.textContent = "Placing order...";
    const result = await hip4.trading.placeOrder({
      marketId: String(market.outcomeId),
      outcome: market.sides[selected.side]!.coin,
      side: action.value as "buy" | "sell",
      type: type.value as "market" | "limit",
      amount: shares.value.trim(),
      price: limitPrice,
      ...(BUILDER && { builderAddress: BUILDER.address, builderFee: BUILDER.fee }),
    });
    note.textContent = !result.success
      ? `Order failed: ${result.error}`
      : result.status === "filled"
        ? `Filled ${result.shares} shares.`
        : "Order placed. It rests on the book until it fills or you cancel it.";
    submit.disabled = false;
    void refreshBook();
    void refreshPortfolio();
  };
  return form;
}

async function cancel(coin: string, orderId: number): Promise<void> {
  try {
    const res = await hip4.trading.cancelOrder([
      { marketId: String(parseSideCoin(coin)!.outcomeId), orderId: String(orderId), outcome: coin },
    ]);
    // A rejected request carries Hyperliquid's reason as a string in `response`.
    const result = res.status === "ok" ? res.response?.data.statuses[0] : undefined;
    if (result !== "success") alert(`Cancel failed: ${result?.error ?? String(res.response)}`);
  } catch (err) {
    alert(`Cancel failed: ${message(err)}`);
  }
  void refreshPortfolio();
}

function renderAccount(): void {
  if (!wallet) {
    accountBox.replaceChildren(button("Connect wallet", () => void connect()), accountError);
    return;
  }
  const address = wallet.account!.address;
  const parts: (Node | string)[] = [el("span", {}, `${address.slice(0, 6)}...${address.slice(-4)}`)];
  if (problem) parts.push(el("span", {}, problem));
  else if (!ready) parts.push(button("Enable trading", () => void enable()));
  if (!problem && Number(perps) > 0) {
    const amount = el("input", { value: perps, inputMode: "decimal", size: 8 });
    parts.push(
      el("span", {}, `${perps} USDC in perps`),
      amount,
      button("Move to spot", () => void move(amount.value.trim())),
    );
  }
  if (accountError) parts.push(el("span", { className: "error" }, accountError));
  accountBox.replaceChildren(...parts);
}

async function connect(): Promise<void> {
  try {
    const client = await connectWallet();
    wallet = client;
    accountError = "";
    problem = await accountProblem(client.account.address);
    if (!problem) perps = await usdcInPerps(client.account.address);
  } catch (err) {
    accountError = message(err);
  }
  renderAccount();
  void refreshPortfolio();
}

async function enable(): Promise<void> {
  if (!wallet) return;
  try {
    await enableTrading(wallet);
    ready = true;
    accountError = "";
  } catch (err) {
    accountError = message(err);
  }
  renderAccount();
}

async function move(amount: string): Promise<void> {
  if (!wallet) return;
  try {
    await moveToSpot(wallet, amount);
    perps = await usdcInPerps(wallet.account!.address);
    accountError = "";
  } catch (err) {
    accountError = message(err);
  }
  renderAccount();
  void refreshPortfolio();
}

/** "Arsenal Yes" style names for a side coin such as "#14730". */
function coinName(coin: string): string {
  for (const options of events) {
    for (const market of options) {
      const side = market.sides.find((s) => s.coin === coin);
      if (side) return options.length > 1 ? `${titleOf(market)}: ${market.name} ${side.name}` : `${market.name}: ${side.name}`;
    }
  }
  return coin;
}

async function refreshPortfolio(): Promise<void> {
  if (!wallet || problem) return portfolio.replaceChildren();
  const user = wallet.account!.address;
  try {
    const [balances, orders] = await Promise.all([hip4.account.fetchBalance(user), hip4.account.fetchOpenOrders(user)]);
    const usdc = balances.find((b) => b.coin === "USDC");
    // Balances name side coins "+14730". Books, prices and orders use "#14730".
    const positions = balances
      .filter((b) => b.coin.startsWith("+") && Number(b.total) > 0)
      .map((b) => ({ ...b, coin: b.coin.replace("+", "#") }));
    portfolio.replaceChildren(
      el("h2", {}, "Your account"),
      el("p", {}, `USDC: ${usdc?.total ?? "0"}${usdc && Number(usdc.hold) > 0 ? ` (${usdc.hold} in open orders)` : ""}`),
      el("h3", {}, "Positions"),
      positions.length === 0
        ? el("p", { className: "note" }, "No positions yet.")
        : el("ul", {}, ...positions.map((p) => el("li", {}, el("span", {}, coinName(p.coin)), el("b", {}, `${stripZeros(p.total)} shares`)))),
      el("h3", {}, "Open orders"),
      orders.length === 0
        ? el("p", { className: "note" }, "No open orders.")
        : el(
            "ul",
            {},
            ...orders.map((o) =>
              el(
                "li",
                {},
                el("span", {}, `${o.side === "B" ? "Buy" : "Sell"} ${stripZeros(o.sz)} ${coinName(o.coin)} at ${cents(o.limitPx)}`),
                button("Cancel", () => void cancel(o.coin, o.oid)),
              ),
            ),
          ),
    );
  } catch (err) {
    portfolio.replaceChildren(`Could not load your account: ${message(err)}`);
  }
}

async function refreshEvents(): Promise<void> {
  try {
    ({ events, mids, templates } = await loadEvents());
    const options = current();
    if (selected && (!options || selected.option >= options.length)) {
      selected = options ? { ...selected, option: 0, side: 0 } : null;
      renderMarket();
    }
    renderEvents();
  } catch (err) {
    status.textContent = `Could not load markets: ${message(err)}`;
  }
}

// The agent key lives in memory, so a different account starts over.
window.ethereum?.on("accountsChanged", () => location.reload());

renderAccount();
void refreshEvents();
setInterval(refreshEvents, 60_000);
setInterval(refreshBook, 3_000);
setInterval(refreshPortfolio, 10_000);
