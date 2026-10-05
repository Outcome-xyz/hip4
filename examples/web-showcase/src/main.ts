import "./style.css";
import type { HIP4Market } from "@outcome.xyz/hip4";
import { CATEGORIES, categoryOf, loadEvents, outcomeUrl } from "./markets";

const tabs = document.querySelector<HTMLElement>("#categories")!;
const list = document.querySelector<HTMLElement>("#events")!;
const status = document.querySelector<HTMLElement>("#status")!;
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });
let selected = "all";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]>,
  ...children: Node[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/** One card per event. Each row opens the market on outcome.xyz in a new tab. */
function card(options: HIP4Market[], mids: Record<string, string>, category: string): HTMLElement {
  const first = options[0]!;
  // A question lists its options. A single market lists its two sides.
  const rows =
    options.length > 1
      ? options.map((m) => ({ market: m, name: m.parsedName ?? m.name, coin: m.sides[0].coin }))
      : first.sides.map((s) => ({ market: first, name: s.parsedName ?? s.name, coin: s.coin }));
  const node = el(
    "article",
    { className: "card" },
    el("h2", {
      textContent: "questionName" in first ? (first.parsedQuestionName ?? first.questionName) : (first.parsedName ?? first.name),
    }),
    ...rows.map((row) =>
      el(
        "a",
        { href: outcomeUrl(row.market, category), target: "_blank", rel: "noopener" },
        el("span", { textContent: row.name }),
        el("b", { textContent: mids[row.coin] ? percent.format(Number(mids[row.coin])) : "-" }),
      ),
    ),
  );
  node.dataset.category = category;
  return node;
}

function filter(): void {
  for (const node of list.children) {
    (node as HTMLElement).hidden = selected !== "all" && (node as HTMLElement).dataset.category !== selected;
  }
  for (const tab of tabs.children) tab.classList.toggle("active", tab.textContent === selected);
  const shown = [...list.children].some((node) => !(node as HTMLElement).hidden);
  status.textContent = shown ? "" : "No markets in this category right now.";
}

async function refresh(): Promise<void> {
  try {
    const { events, mids, templates } = await loadEvents();
    list.replaceChildren(...events.map((options) => card(options, mids, categoryOf(options[0]!, templates))));
    filter();
  } catch (err) {
    status.textContent = `Could not load markets: ${err instanceof Error ? err.message : String(err)}`;
  }
}

tabs.append(
  ...["all", ...CATEGORIES].map((category) =>
    el("button", {
      textContent: category,
      onclick: () => {
        selected = category;
        filter();
      },
    }),
  ),
);
void refresh();
setInterval(refresh, 60_000);
