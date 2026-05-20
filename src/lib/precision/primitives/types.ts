import type { Decimal } from "./core";

type DecimalInput = string | number | Decimal;

type PositionCalc = {
  readonly entryPrice: string;
  readonly positionValue: string;
  readonly pnl: string;
  readonly roe: string;
};

type FeeResult = {
  readonly net: string;
  readonly fee: string;
};

type CpmmQuoteResult = {
  readonly sharesOut: string;
  readonly effectivePrice: string;
  readonly slippagePct: string;
};

type FormatUsdOpts = {
  readonly dp?: number;
  readonly compact?: boolean;
  readonly truncate?: boolean;
  readonly sign?: boolean;
};

type FormatBalanceOpts = {
  readonly maxDp?: number;
  readonly minDp?: number;
  readonly compact?: boolean;
};

export type {
  DecimalInput,
  PositionCalc,
  FeeResult,
  CpmmQuoteResult,
  FormatUsdOpts,
  FormatBalanceOpts,
};
