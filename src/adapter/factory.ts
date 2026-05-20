import { HyperliquidHip4Adapter } from "./hyperliquid";

/** Configuration for creating a HIP-4 prediction market adapter. */
export interface CreateHIP4AdapterConfig {
	testnet?: boolean;
	infoUrl?: string;
	exchangeUrl?: string;
	/**
	 * Builder address for fee collection.
	 * When set, all orders will include this builder address.
	 */
	builderAddress?: string;
	/**
	 * Builder fee in tenths of a basis point (0-1000).
	 * 0 = no fee. 100 = 0.1%. 1000 = 1.0% (maximum).
	 */
	builderFee?: number;
	/** Optional logger. Default: no-op. */
	logger?: (
		level: "debug" | "info" | "warn" | "error",
		msg: string,
		data?: unknown,
	) => void;
}

/** Create a PredictionsAdapter backed by Hyperliquid HIP-4 spot markets. */
export function createHIP4Adapter(
	config: CreateHIP4AdapterConfig = {},
): HyperliquidHip4Adapter {
	return new HyperliquidHip4Adapter(config);
}
