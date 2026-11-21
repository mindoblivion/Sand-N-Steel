#!/usr/bin/env node
/**
 * Produce a reversible, animation-trimmed civilian GLB candidate.
 *
 * This intentionally does NOT alter geometry, textures, materials, skinning,
 * or the source file. The optimized candidate is written to a separate path.
 *
 * Usage:
 *   node scripts/prepare-civilian-glb.mjs public/models/civilian.glb /tmp/civilian-trimmed.glb
 */
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) {
  console.error('Usage: node scripts/prepare-civilian-glb.mjs <input.glb> <output.glb>');
  process.exit(2);
}

const inputPath = path.resolve(inputArg);
const outputPath = path.resolve(outputArg);
if (inputPath === outputPath) {
  throw new Error('Refusing to overwrite the source GLB. Choose a separate output path.');
}
if (!fs.existsSync(inputPath)) throw new Error(`Input GLB not found: ${inputPath}`);

const KEEP_ANIMATIONS = new Set([
  'Idle_A',
  'Idle_Talking',
  'Greeting',
  'Walk',
  'Walk_Relaxed',
  'Walk_Formal',
  'Sit_Ground_Idle',
  'Pray',
]);

function inventory(doc) {
  const root = doc.getRoot();
  return {
    meshes: root.listMeshes().length,
    skins: root.listSkins().length,
    jointCounts: root.listSkins().map((skin) => skin.listJoints().length).sort((a, b) => a - b),
    materials: root.listMaterials().length,
    textures: root.listTextures().length,
    animations: root.listAnimations().map((animation) => animation.getName()).sort(),
  };
}

function assertPreserved(before, after) {
  for (const key of ['meshes', 'skins', 'materials', 'textures']) {
    if (before[key] !== after[key]) {
      throw new Error(`Asset integrity check failed: ${key} changed from ${before[key]} to ${after[key]}.`);
    }
  }
  if (JSON.stringify(before.jointCounts) !== JSON.stringify(after.jointCounts)) {
    throw new Error('Asset integrity check failed: skin joint counts changed.');
  }
  const expected = [...KEEP_ANIMATIONS].sort();
  if (JSON.stringify(after.animations) !== JSON.stringify(expected)) {
    throw new Error(`Animation allowlist mismatch. Expected ${expected.join(', ')}; got ${after.animations.join(', ')}.`);
  }
}

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
const document = await io.read(inputPath);
const before = inventory(document);
const missing = [...KEEP_ANIMATIONS].filter((name) => !before.animations.includes(name));
if (missing.length) {
  throw new Error(`Required civilian clips missing from source: ${missing.join(', ')}.`);
}

for (const animation of document.getRoot().listAnimations()) {
  if (!KEEP_ANIMATIONS.has(animation.getName())) animation.dispose();
}

const outputDirectory = path.dirname(outputPath);
fs.mkdirSync(outputDirectory, { recursive: true });
const binary = await io.writeBinary(document);
fs.writeFileSync(outputPath, Buffer.from(binary));

const verification = await io.read(outputPath);
const after = inventory(verification);
assertPreserved(before, after);

const sourceBytes = fs.statSync(inputPath).size;
const outputBytes = fs.statSync(outputPath).size;
const savedBytes = sourceBytes - outputBytes;
console.log(JSON.stringify({
  source: inputPath,
  output: outputPath,
  sourceBytes,
  outputBytes,
  savedBytes,
  savedPercent: Number(((savedBytes / sourceBytes) * 100).toFixed(1)),
  before,
  after,
  sourcePreserved: fs.existsSync(inputPath) && fs.statSync(inputPath).size === sourceBytes,
  validation: 'passed',
}, null, 2));
