import { Decimal, toDecimal } from "../primitives/core";
import type { DecimalInput, PositionCalc } from "../primitives/types";

function computePosition(
  total: DecimalInput,
  entryNtl: DecimalInput,
  markPrice: DecimalInput,
): PositionCalc {
  const totalDec = toDecimal(total);
  const entryNtlDec = toDecimal(entryNtl);
  const markDec = toDecimal(markPrice);

  const entryPriceDec = totalDec.isZero()
    ? new Decimal(0)
    : entryNtlDec.dividedBy(totalDec);

  const positionValueDec = totalDec.times(markDec);
  const pnlDec = positionValueDec.minus(entryNtlDec);
  const roeDec = entryNtlDec.isZero()
    ? new Decimal(0)
    : pnlDec.dividedBy(entryNtlDec).times(100);

  return {
    entryPrice: entryPriceDec.toString(),
    positionValue: positionValueDec.toString(),
    pnl: pnlDec.toString(),
    roe: roeDec.toString(),
  };
}

function computeTradeNotional(size: DecimalInput, price: DecimalInput): string {
  return toDecimal(size).times(toDecimal(price)).toString();
}

function sumValues(values: DecimalInput[]): string {
  return values
    .reduce<Decimal>((acc, v) => acc.plus(toDecimal(v)), new Decimal(0))
    .toString();
}

function computePnlFromFills(
  fills: ReadonlyArray<{ closedPnl: string }>,
): string {
  return fills
    .reduce<Decimal>((acc, f) => acc.plus(toDecimal(f.closedPnl)), new Decimal(0))
    .toString();
}

function computeVolumeFromFills(
  fills: ReadonlyArray<{ sz: string; px: string }>,
): string {
  return fills
    .reduce<Decimal>(
      (acc, f) => acc.plus(toDecimal(f.sz).times(toDecimal(f.px))),
      new Decimal(0),
    )
    .toString();
}

export {
  computePosition,
  computeTradeNotional,
  sumValues,
  computePnlFromFills,
  computeVolumeFromFills,
};
