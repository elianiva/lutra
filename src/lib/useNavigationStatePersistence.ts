import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	useNavigationContainerRef,
	useRootNavigationState,
} from "expo-router";
import { useEffect, useState } from "react";

const STORAGE_KEY = "dev_nav_state";

/**
 * Strip ephemeral keys (e.g. React Navigation's auto-generated `key`)
 * from the persisted state so it can be safely restored after a reload.
 */
function stripState(state: unknown): unknown {
	if (typeof state !== "object" || state === null) return undefined;
	const record = state as Record<string, unknown>;
	const { index, name, routes, state: childState } = record;

	const strippedRoutes = Array.isArray(routes)
		? routes.map(stripState).filter(Boolean)
		: undefined;

	return {
		index,
		name,
		routes: strippedRoutes,
		state: childState ? stripState(childState) : undefined,
	};
}

/**
 * Persist and restore the navigation state across Fast Refresh / app
 * reloads in development.  Does nothing in production builds.
 *
 * Returns `true` once the previous state has been rehydrated (or
 * determined to be unavailable).  Callers can use this to avoid
 * rendering until the correct screen is in place.
 */
export function useNavigationStatePersistence(): boolean {
	// Only persist/restore navigation state in development.
	// In production, skip everything — no AsyncStorage churn, no stale state.
	if (!__DEV__) return true;

	const [ready, setReady] = useState(false);
	const [didRestore, setDidRestore] = useState(false);
	const navRef = useNavigationContainerRef();
	const rootState = useRootNavigationState();

	// Save state to storage whenever it changes (after initial hydration).
	useEffect(() => {
		if (!rootState || !ready) return;
		AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(rootState));
	}, [rootState, ready]);

	// Restore previous state once the navigation container is ready.
	// We use rootState (not navRef) as the dependency because navRef is a
	// stable ref that never changes identity, so the effect would only run
	// once on mount — before the container is actually ready.
	useEffect(() => {
		if (didRestore || !rootState) return;

		AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
			if (raw) {
				try {
					const prev = stripState(JSON.parse(raw));
					if (prev) {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						navRef.current?.resetRoot(prev as any);
					}
				} catch {
					// Corrupt stored state — ignore and start fresh.
				}
			}
			setReady(true);
			setDidRestore(true);
		});
	}, [rootState, didRestore]);

	return ready;
}
