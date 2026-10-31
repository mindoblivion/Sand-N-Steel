// @ts-ignore - bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildLibitinariaDressingGeometry,
  buildPortcullisGrilleGeometry,
  buildTriumphalisDressingGeometry,
} from '../components/3d/DuelArena';

const arenaSource = readFileSync(
  fileURLToPath(new URL('../components/3d/DuelArena.tsx', import.meta.url)),
  'utf8',
);

describe('AI-1 arena interior integration', () => {
  test('all four existing arena surfaces use the procedural textures with flat-colour fallbacks', () => {
    expect(arenaSource).toContain('map={arenaTextures.sand}');
    expect(arenaSource).toContain("color={arenaTextures.sand ? '#ffffff' : '#c29b62'}");
    expect(arenaSource).toContain('alphaMap={arenaTextures.ringPaint}');
    expect(arenaSource).toContain('map={arenaTextures.wall}');
    expect(arenaSource).toContain("color={arenaTextures.wall ? '#ffffff' : '#d4a373'}");
    expect((arenaSource.match(/map=\{arenaTextures\.tiers\}/g) ?? []).length).toBe(2);
    expect(arenaSource).toContain("color={arenaTextures.tiers ? ARENA_INTERIOR_COLORS.limestone : '#854d0e'}");
    expect(arenaSource).toContain("color={arenaTextures.tiers ? '#ffffff' : '#b47b48'}");
  });

  test('the gates keep their shipped world transforms and distinguish the two entrances', () => {
    expect(arenaSource).toContain(
      'position={[Math.cos(angle) * 20.0, 2.2, Math.sin(angle) * 20.0]} rotation={[0, -angle + Math.PI / 2, 0]}',
    );
    expect(arenaSource).toContain('const isTriumphalis = Math.sin(angle) < 0;');
    expect(arenaSource).toContain('geometry={gateGeometry.grille}');
    expect(arenaSource).toContain('geometry={isTriumphalis ? gateGeometry.triumphalis : gateGeometry.libitinaria}');
    expect(arenaSource).toContain('<meshStandardMaterial vertexColors metalness={0.65} roughness={0.4} />');
  });

  test('the merged portcullis keeps the 5.2 x 4.4 inset and its bars extend by their 0.16 thickness', () => {
    const geometry = buildPortcullisGrilleGeometry();
    try {
      geometry.computeBoundingBox();
      expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
      expect(geometry.boundingBox?.max.x! - geometry.boundingBox?.min.x!).toBeCloseTo(5.36, 5);
      expect(geometry.boundingBox?.max.y! - geometry.boundingBox?.min.y!).toBeCloseTo(4.56, 5);
    } finally {
      geometry.dispose();
    }
  });

  test('Triumphalis and Libitinaria each build one non-empty, vertex-coloured dressing geometry', () => {
    const triumphalis = buildTriumphalisDressingGeometry();
    const libitinaria = buildLibitinariaDressingGeometry();
    try {
      for (const geometry of [triumphalis, libitinaria]) {
        expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
        expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
      }
      expect(triumphalis.getAttribute('position').count).toBeGreaterThan(
        libitinaria.getAttribute('position').count,
      );
    } finally {
      triumphalis.dispose();
      libitinaria.dispose();
    }
  });
});
