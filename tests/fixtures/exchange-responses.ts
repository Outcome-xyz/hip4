import type { HLExchangeResponse } from "../../src/adapter/hyperliquid/types";

/** Order was fully filled immediately */
export const FILLED_RESPONSE: HLExchangeResponse = {
  status: "ok",
  response: {
    type: "order",
    data: {
      statuses: [
        {
          filled: {
            totalSz: "50.0",
            avgPx: "0.550",
            oid: 90001,
          },
        },
      ],
    },
  },
};

/** Order is resting on the book (limit order not immediately filled) */
export const RESTING_RESPONSE: HLExchangeResponse = {
  status: "ok",
  response: {
    type: "order",
    data: {
      statuses: [
        {
          resting: {
            oid: 90002,
          },
        },
      ],
    },
  },
};

/** Order was rejected by the exchange */
export const ERROR_RESPONSE: HLExchangeResponse = {
  status: "ok",
  response: {
    type: "order",
    data: {
      statuses: [
        {
          error: "Insufficient margin",
        },
      ],
    },
  },
};

/** Top-level error (e.g., bad signature, malformed request) */
export const TOP_LEVEL_ERROR_RESPONSE: HLExchangeResponse = {
  status: "err",
};

/** Mixed response: one fill + one resting */
export const MIXED_RESPONSE: HLExchangeResponse = {
  status: "ok",
  response: {
    type: "order",
    data: {
      statuses: [
        {
          filled: {
            totalSz: "25.0",
            avgPx: "0.540",
            oid: 90003,
          },
        },
        {
          resting: {
            oid: 90004,
          },
        },
      ],
    },
  },
};
