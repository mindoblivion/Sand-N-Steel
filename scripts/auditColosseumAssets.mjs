import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const archive = 'public/colosseum-loading-assets.zip';
const civilian = 'public/models/civilian.glb';

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}

function parseGlb(buffer, label) {
  if (buffer.length < 20 || buffer.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error(`${label}: invalid GLB header`);
  }
  const version = buffer.readUInt32LE(4);
  const declaredLength = buffer.readUInt32LE(8);
  if (version !== 2 || declaredLength !== buffer.length) {
    throw new Error(`${label}: unexpected GLB version/length (v${version}, declared ${declaredLength}, actual ${buffer.length})`);
  }
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a || 20 + jsonLength > buffer.length) {
    throw new Error(`${label}: missing valid JSON chunk`);
  }
  const json = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength).trim());
  const summary = {
    label,
    bytes: buffer.length,
    version,
    scenes: json.scenes?.length ?? 0,
    nodes: json.nodes?.length ?? 0,
    meshes: json.meshes?.length ?? 0,
    primitives: (json.meshes ?? []).reduce((sum, mesh) => sum + (mesh.primitives?.length ?? 0), 0),
    skins: json.skins?.length ?? 0,
    joints: (json.skins ?? []).map((skin) => skin.joints?.length ?? 0),
    animationCount: json.animations?.length ?? 0,
    usefulAnimationNames: (json.animations ?? []).map((animation) => animation.name || '(unnamed)').filter((name) => /idle|walk|jog|run|talk|greet|sit|stand|pray|bow|look|point/i.test(name)),
    vertexCounts: (json.meshes ?? []).flatMap((mesh) => (mesh.primitives ?? []).map((primitive) => json.accessors?.[primitive.attributes?.POSITION]?.count ?? 0)),
    indexCounts: (json.meshes ?? []).flatMap((mesh) => (mesh.primitives ?? []).map((primitive) => primitive.indices == null ? null : json.accessors?.[primitive.indices]?.count ?? null)),
    embeddedImageBytes: (json.images ?? []).map((image) => image.bufferView == null ? null : json.bufferViews?.[image.bufferView]?.byteLength ?? null),
    materials: json.materials?.length ?? 0,
    textures: json.textures?.length ?? 0,
    images: (json.images ?? []).map((image) => ({
      name: image.name || null,
      mimeType: image.mimeType || null,
      uri: image.uri || null,
      bufferView: image.bufferView ?? null,
    })),
    nodeNames: (json.nodes ?? []).map((node) => node.name).filter(Boolean).slice(0, 80),
  };
  console.log(JSON.stringify(summary, null, 2));
}

if (!existsSync(archive)) throw new Error(`Missing ${archive}`);
if (!existsSync(civilian)) throw new Error(`Missing ${civilian}`);

console.log('=== COLOSSEUM ARENA ZIP DIRECTORY ===');
const entries = run('unzip', ['-Z1', archive]).split('\n').filter(Boolean);
console.log(JSON.stringify(entries, null, 2));
console.log('=== COLOSSEUM ARENA ZIP FILE SIZES ===');
console.log(run('unzip', ['-l', archive]));

const modelEntries = entries.filter((entry) => /\.(glb|gltf)$/i.test(entry));
if (modelEntries.length === 0) {
  const readme = entries.find((entry) => /readme/i.test(entry));
  if (readme) console.log('=== ARCHIVE README ===\\n' + execFileSync('unzip', ['-p', archive, readme], { encoding: 'utf8' }));
  throw new Error('Expected the fighting-arena archive to contain a .glb or .gltf model, but none was found.');
}
for (const entry of modelEntries) {
  if (/\.glb$/i.test(entry)) {
    const bytes = execFileSync('unzip', ['-p', archive, entry], { maxBuffer: 256 * 1024 * 1024 });
    parseGlb(bytes, `archive:${entry}`);
  } else {
    const text = execFileSync('unzip', ['-p', archive, entry], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const json = JSON.parse(text);
    console.log(JSON.stringify({
      label: `archive:${entry}`,
      asset: json.asset,
      scenes: json.scenes?.length ?? 0,
      nodes: json.nodes?.length ?? 0,
      meshes: json.meshes?.length ?? 0,
      skins: json.skins?.length ?? 0,
      animations: (json.animations ?? []).map((animation) => animation.name || '(unnamed)'),
      materials: json.materials?.length ?? 0,
      textures: json.textures?.length ?? 0,
      images: json.images ?? [],
      buffers: json.buffers ?? [],
    }, null, 2));
  }
}
console.log('=== ROMAN CIVILIAN GLB ===');
parseGlb(readFileSync(civilian), civilian);
