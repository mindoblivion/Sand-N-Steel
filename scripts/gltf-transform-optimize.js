#!/usr/bin/env node
/**
 * Gladiator 3D Model Compressor & Optimizer using gltf-transform
 * 
 * Capabilities:
 * - Mesh Optimization: Deduplication (dedup), vertex welding (weld), attribute quantization (quantize),
 *   pruning of unused nodes/accessors/materials (prune), and GPU vertex cache optimization (reorder).
 * - Geometry Draco Compression: High-density mesh compression via KHR_draco_mesh_compression
 *   and Google Draco encoder module for ultra-fast web streaming.
 * - Texture Optimization & Resizing: Inspects textures, resizes oversized maps, and compresses
 *   them using sharp / webp for mobile WebGL memory efficiency.
 * - Animation Compaction: Keyframe resampling (resample) and cleanup of redundant curve samplers.
 * 
 * Usage:
 *   # Compress the default Roman Warrior & Arena model:
 *   npm run compress:glb
 *   npm run optimize:glb
 * 
 *   # Compress any arbitrary GLB model now or in the future:
 *   node scripts/gltf-transform-optimize.js <input.glb> [output.glb] [options]
 * 
 * Examples:
 *   node scripts/gltf-transform-optimize.js public/models/arena_roman.glb
 *   node scripts/gltf-transform-optimize.js public/models/gladiator_heavy.glb public/models/gladiator_heavy_opt.glb
 *   node scripts/gltf-transform-optimize.js public/models/monster.glb --no-draco
 */

import fs from 'fs';
import path from 'path';
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  prune,
  weld,
  quantize,
  reorder,
  resample,
  draco,
  textureCompress,
} from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

// Parse command line arguments
const args = process.argv.slice(2);
const flags = new Set(args.filter(arg => arg.startsWith('--')));
const posArgs = args.filter(arg => !arg.startsWith('--'));

const inputArg = posArgs[0] || 'public/models/arena_roman.glb';
const outputArg = posArgs[1] || inputArg;

const useDraco = !flags.has('--no-draco');
const skipTextureComp = flags.has('--no-texture-compress');
const maxTextureDimension = 1024; // Standard mobile WebGL budget

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export async function optimizeGlb(inputPath, outputPath, options = {}) {
  const {
    enableDraco = useDraco,
    compressTextures = !skipTextureComp,
    maxTexSize = maxTextureDimension,
  } = options;

  const resolvedInput = path.resolve(process.cwd(), inputPath);
  const resolvedOutput = path.resolve(process.cwd(), outputPath);

  if (!fs.existsSync(resolvedInput)) {
    console.error(`[gltf-transform] Input file not found: ${resolvedInput}`);
    console.error(`Tip: Ensure the 3D model exists at that path before running the compressor.`);
    return { success: false, error: 'File not found' };
  }

  const initialStat = fs.statSync(resolvedInput);
  const initialBytes = initialStat.size;

  console.log('\n============================================================');
  console.log('🏛️  SAND & STEEL 3D ASSET COMPRESSOR (gltf-transform)');
  console.log('============================================================');
  console.log(`Input Model:  ${inputPath}`);
  console.log(`Output Model: ${outputPath}`);
  console.log(`Initial Size: ${formatBytes(initialBytes)}`);
  console.log(`Configuration:`);
  console.log(`  - Mesh Optimization (dedup, prune, weld, reorder, quantize): YES`);
  console.log(`  - Animation Keyframe Resampling:                             YES`);
  console.log(`  - Draco Geometry Compression:                                ${enableDraco ? 'ENABLED (high density)' : 'DISABLED'}`);
  console.log(`  - Texture Resizing / WebP (limit: ${maxTexSize}px):              ${compressTextures ? 'ENABLED' : 'DISABLED'}`);
  console.log('------------------------------------------------------------');

  // Step 1: Initialize Draco encoder & decoder modules
  let encoderModule = null;
  let decoderModule = null;

  try {
    encoderModule = await draco3d.createEncoderModule();
    decoderModule = await draco3d.createDecoderModule();
  } catch (err) {
    console.warn('[gltf-transform] Could not initialize Draco modules:', err.message);
  }

  // Step 2: Initialize gltf-transform NodeIO with Khronos extensions
  const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
  if (encoderModule && decoderModule) {
    io.registerDependencies({
      'draco3d.encoder': encoderModule,
      'draco3d.decoder': decoderModule,
    });
  }

  console.log('[1/4] Reading and parsing GLB binary container...');
  const doc = await io.read(resolvedInput);

  const root = doc.getRoot();
  const initialMeshes = root.listMeshes().length;
  const initialTextures = root.listTextures().length;
  const initialAnimations = root.listAnimations().length;

  console.log(`      Found: ${initialMeshes} meshes, ${initialTextures} textures, ${initialAnimations} animations.`);

  // Step 3: Optional Texture Compression & Resizing
  if (compressTextures && initialTextures > 0) {
    console.log(`[2/4] Optimizing and resizing ${initialTextures} texture maps (max ${maxTexSize}px)...`);
    try {
      const sharpModule = await import('sharp').then(m => m.default || m).catch(() => null);
      if (sharpModule) {
        // Resize large texture buffers
        for (const texture of root.listTextures()) {
          const imageBuffer = texture.getImage();
          if (imageBuffer && imageBuffer.length > 0) {
            try {
              const meta = await sharpModule(imageBuffer).metadata();
              if (meta.width > maxTexSize || meta.height > maxTexSize) {
                console.log(`      Resizing texture "${texture.getName() || 'unnamed'}" from ${meta.width}x${meta.height} to fit ${maxTexSize}px...`);
                const resized = await sharpModule(imageBuffer)
                  .resize({
                    width: maxTexSize,
                    height: maxTexSize,
                    fit: 'inside',
                    withoutEnlargement: true
                  })
                  .webp({ quality: 85 })
                  .toBuffer();
                texture.setImage(resized);
                texture.setMimeType('image/webp');
              }
            } catch (texErr) {
              // Ignore single texture parse errors
            }
          }
        }

        // Apply gltf-transform texture compressor
        await doc.transform(
          textureCompress({
            encoder: sharpModule,
            targetFormat: 'webp',
            resize: [maxTexSize, maxTexSize],
          })
        );
      }
    } catch (texErr) {
      console.warn('      Texture optimization note:', texErr.message);
    }
  } else {
    console.log('[2/4] Skipping texture compression (no textures or disabled).');
  }

  // Step 4: Mesh Optimization, Vertex Welding, Keyframe Resampling, & Draco
  console.log('[3/4] Running mesh deduplication, vertex welding & animation resampling...');
  const transforms = [
    dedup(),
    prune(),
    weld({ tolerance: 0.0001 }),
    resample(),
  ];

  try {
    const meshopt = await import('meshoptimizer');
    if (meshopt && meshopt.MeshoptEncoder) {
      if (meshopt.MeshoptEncoder.ready) {
        await meshopt.MeshoptEncoder.ready;
      }
      transforms.push(reorder({ encoder: meshopt.MeshoptEncoder }));
    }
  } catch (mErr) {
    // Continue without reorder if meshoptimizer is unavailable
  }

  if (enableDraco && encoderModule) {
    console.log('      Applying Draco geometry compression (edgebreaker)...');
    transforms.push(
      draco({
        encoder: encoderModule,
        method: 'edgebreaker',
        quantizationBits: {
          POSITION: 14,
          NORMAL: 10,
          COLOR: 8,
          TEX_COORD: 12,
          GENERIC: 12,
        },
      })
    );
  } else {
    transforms.push(quantize());
  }

  await doc.transform(...transforms);

  // Step 5: Export optimized GLB container
  console.log('[4/4] Writing optimized GLB binary to disk...');
  const outDir = path.dirname(resolvedOutput);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // If overwriting existing file, create a backup safety copy
  if (resolvedInput === resolvedOutput && fs.existsSync(resolvedOutput)) {
    const backupPath = `${resolvedOutput}.backup.glb`;
    try {
      fs.copyFileSync(resolvedOutput, backupPath);
      console.log(`      Created backup safety copy: ${path.basename(backupPath)}`);
    } catch (bErr) {
      // Continue
    }
  }

  const outputBytes = await io.writeBinary(doc);
  fs.writeFileSync(resolvedOutput, Buffer.from(outputBytes));

  const finalBytes = outputBytes.byteLength;
  const savedBytes = initialBytes - finalBytes;
  const savingsPct = initialBytes > 0 ? Math.round((savedBytes / initialBytes) * 100) : 0;

  console.log('------------------------------------------------------------');
  console.log('✨ OPTIMIZATION COMPLETED SUCCESSFULLY');
  console.log(`Initial Size: ${formatBytes(initialBytes)}`);
  console.log(`Final Size:   ${formatBytes(finalBytes)}`);
  console.log(`Savings:      ${formatBytes(Math.max(0, savedBytes))} (${savingsPct}%)`);
  console.log(`Target:       ${outputPath}`);
  console.log('============================================================\n');

  return {
    success: true,
    initialBytes,
    finalBytes,
    savingsPct,
    outputPath,
  };
}

// Automatically execute if called directly via CLI
if (process.argv[1] && (process.argv[1].endsWith('gltf-transform-optimize.js') || process.argv[1].endsWith('optimize-glb.js'))) {
  optimizeGlb(inputArg, outputArg).catch((err) => {
    console.error('[gltf-transform] Optimization failed:', err);
    process.exit(1);
  });
}
