import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ThreeComponentErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  componentName?: string;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ThreeComponentErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Granular React Error Boundary specifically designed for 3D components
 * (such as GladiatorMesh, city buildings, or arena geometry).
 * Catches rendering errors in isolated 3D sub-trees to prevent full app crashes.
 */
export class ThreeComponentErrorBoundary extends Component<
  ThreeComponentErrorBoundaryProps,
  ThreeComponentErrorBoundaryState
> {
  public state: ThreeComponentErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ThreeComponentErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const name = this.props.componentName || '3D Sub-Component';
    console.warn(`[ThreeComponentErrorBoundary - ${name}] Caught 3D render exception:`, error.message, errorInfo.componentStack);

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  public render() {
    if (this.state.hasError) {
      // If a custom fallback is provided, render it. Default fallback is null or simple 3D placeholder
      return this.props.fallback !== undefined ? this.props.fallback : null;
    }

    return this.props.children;
  }
}
