import { Skia, type SkRuntimeEffect } from "@shopify/react-native-skia";

import { chainKey, generateChainSource } from "./chain-source";
import { type Layer } from "./types";

type ChainEntry = { source: string; effect: SkRuntimeEffect };

// Per-chain-config cache of compiled SkRuntimeEffects. Skia does not
// cache RuntimeEffect internally; the public Make() is the only entry
// point and it re-parses + validates every call. Without this cache
// every layer add/remove/reorder/visibility-toggle would pay a fresh
// parse on the JS thread (~5-30 ms on a phone).
//
// Key: the ordered type list. Two chains with the same order and same
// type set share an effect, even if their SV values differ. Slider
// drags do not touch the cache \u2014 they only update uniforms.
//
// Storage: unbounded Map. In practice users accumulate tens of distinct
// chain configs, not thousands; the theoretical ceiling (every
// permutation of every subset of 9 layer types) is hundreds of
// thousands of entries, which we will never reach. If memory profiling
// later shows growth matters, swap the Map for an LRU; the interface
// stays the same.
//
// invalidate() exists for the dev workflow where a body template
// changes at runtime and the cache needs to be flushed. Not exposed in
// production paths.
class ChainEffectCache {
	private map = new Map<string, ChainEntry>();

	get(layers: Layer[]): ChainEntry {
		const key = chainKey(layers);
		const hit = this.map.get(key);
		if (hit) return hit;
		const source = generateChainSource(layers);
		const effect = Skia.RuntimeEffect.Make(source);
		if (!effect) {
			throw new Error(`Failed to compile chain shader:\n${source}`);
		}
		const entry: ChainEntry = { source, effect };
		this.map.set(key, entry);
		return entry;
	}

	invalidate(): void {
		this.map.clear();
	}
}

export const chainCache = new ChainEffectCache();
