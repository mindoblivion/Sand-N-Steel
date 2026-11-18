// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { resolveAssetLoadingOverlayVisibility } from './assetLoadingOverlayState';

describe('resolveAssetLoadingOverlayVisibility', () => {
  test('keeps the global overlay hidden before any asset request starts', () => {
    expect(resolveAssetLoadingOverlayVisibility(false, 0, false)).toEqual({
      shouldRender: false,
      assetsLoaded: false,
    });
  });

  test('shows the overlay while an asset request is active, even if progress is stale at 100%', () => {
    expect(resolveAssetLoadingOverlayVisibility(true, 100, false)).toEqual({
      shouldRender: true,
      assetsLoaded: false,
    });
  });

  test('keeps a completed overlay mounted for its fade-out', () => {
    expect(resolveAssetLoadingOverlayVisibility(false, 100, false)).toEqual({
      shouldRender: true,
      assetsLoaded: true,
    });
    expect(resolveAssetLoadingOverlayVisibility(false, 99, false)).toEqual({
      shouldRender: true,
      assetsLoaded: true,
    });
  });

  test('shows the recovery surface when asset errors exist', () => {
    expect(resolveAssetLoadingOverlayVisibility(false, 0, true)).toEqual({
      shouldRender: true,
      assetsLoaded: false,
    });
  });

  test('does not treat invalid or incomplete idle progress as active work', () => {
    expect(resolveAssetLoadingOverlayVisibility(false, Number.NaN, false)).toEqual({
      shouldRender: false,
      assetsLoaded: false,
    });
    expect(resolveAssetLoadingOverlayVisibility(false, 98.9, false)).toEqual({
      shouldRender: false,
      assetsLoaded: false,
    });
  });
});
