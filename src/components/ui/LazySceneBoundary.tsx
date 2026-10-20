import React, { Component, type ReactNode } from 'react';
import { LoadFailureScreen } from './GameFailureSurface';

/**
 * START-1 — the destination-load boundary.
 *
 * The three destinations (city, duel arena, circus) are `React.lazy()` chunks. When one
 * of them fails to arrive — a dropped connection, a stale service-worker entry, a
 * renamed asset — React throws inside the Suspense boundary and the player is left on
 * the fallback forever. This boundary catches that, names the tier that failed and
 * offers the recovery that actually works.
 *
 * The retry reloads the document rather than resetting state: a chunk that failed to
 * import is not re-requested by re-rendering, so a reset would only fail again.
 */

export type LoadTier = 'city' | 'arena' | 'circus';

const TIER_LABELS: Record<LoadTier, string> = {
  city: 'The city',
  arena: 'The arena',
  circus: 'The circus',
};

interface Props {
  tier: LoadTier;
  children: ReactNode;
}

interface State {
  failed: boolean;
  message: string;
}

export class LazySceneBoundary extends Component<Props, State> {
  public state: State = { failed: false, message: '' };

  public static getDerivedStateFromError(error: Error): State {
    return { failed: true, message: error?.message ?? '' };
  }

  public componentDidCatch(error: Error) {
    console.error('[LazySceneBoundary] destination failed to load:', this.props.tier, error);
  }

  public render() {
    if (this.state.failed) {
      return <LoadFailureScreen tierLabel={TIER_LABELS[this.props.tier]} detail={this.state.message} />;
    }
    return this.props.children;
  }
}
