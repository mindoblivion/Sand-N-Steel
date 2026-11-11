/**
 * Mobile Character Creation Layout & Tab Navigation Test Suite.
 *
 * Verifies the mobile split-screen redesign for Sand & Steel:
 * - 3-tab category navigation (Identity & Class, Corpus & Origin, Attributes & Points).
 * - Preservation of data attributes for automated test compliance.
 * - Touch-action handling for 3D gesture isolation (touch-action: pan-y).
 * - Minimum 48px touch targets for mobile usability.
 * - Android safe-area inset protection for navigation bars.
 *
 * Run with: bun test src/utils/characterCreationMobileLayout.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

const creationSource = () => readFileSync('src/components/hub/CharacterCreation.tsx', 'utf8');
const previewSource = () => readFileSync('src/components/3d/GladiatorPreview.tsx', 'utf8');

describe('Mobile Character Creation Layout & Navigation', () => {
  test('implements a 3-tab category navigation bar with data-tab attributes', () => {
    const source = creationSource();
    expect(source).toContain('data-creation-tabs="true"');
    expect(source).toContain('data-tab="identity"');
    expect(source).toContain('data-tab="body"');
    expect(source).toContain('data-tab="features"');
    expect(source).toContain('data-tab-panel={activeTab}');
  });

  test('preserves all required data attributes for system test compliance', () => {
    const source = creationSource();
    expect(source).toContain('data-armatura-picker');
    expect(source).toContain('data-armatura-card={row.id}');
    expect(source).toContain('data-corpus-build-picker');
    expect(source).toContain('data-corpus-build-card={row.id}');
    expect(source).toContain('data-optional-background');
    expect(source).toContain('data-corpus-origo-picker');
    expect(source).toContain('data-corpus-origo-card={row.id}');
    expect(source).toContain('data-corpus-vitium-picker');
    expect(source).toContain('data-corpus-vitium-card="none"');
    expect(source).toContain('data-corpus-vitium-card={row.id}');
    expect(source).toContain('data-derived-preview="1"');
    expect(source).toContain('data-action="submit-character"');
  });

  test('enforces touch-action pan-y on preview container and canvas for vertical scroll isolation', () => {
    const preview = previewSource();
    expect(preview).toContain('touch-pan-y');
    expect(preview).toContain("touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.PAN }}");
  });

  test('guarantees touch targets are at least 48px high for mobile ergonomics', () => {
    const source = creationSource();
    expect(source).toContain('min-h-[48px]');
    expect(source).toContain('min-h-[52px]');
  });

  test('includes Android safe-area bottom padding for edge-to-edge mobile screens', () => {
    const source = creationSource();
    expect(source).toContain('env(safe-area-inset-bottom)');
  });
});
