import React, { Suspense } from 'react';

// The Drei progress hook imports Three.js. Load the real overlay only after a
// 3D destination is entered so the title-screen bundle stays renderer-free.
const AssetLoadingOverlayContent = React.lazy(() =>
  import('./AssetLoadingOverlayContent').then((module) => ({ default: module.AssetLoadingOverlayContent })),
);

export const AssetLoadingOverlay: React.FC = () => (
  <Suspense fallback={null}>
    <AssetLoadingOverlayContent />
  </Suspense>
);
