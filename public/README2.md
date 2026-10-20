# 🐎 Roman Chariot Racing Horses — Game-Ready Asset Pack

A complete, **fully game-ready** 3D horse asset set for Roman chariot / circus racing games. Three upgrade tiers — **Weak → Better → Great** — each a skinned, textured, rigged and animated GLB model. Tier 3 is a fully armoured war horse with gold lamellar armour and a red velvet saddle, matching the classic Roman _hippika gymnasia_ look.

Everything is generated procedurally from scratch (Blender + Python) so the whole pack is reproducible and license-clean.

**Live viewer:** [https://sites.super.myninja.ai/a83ebbbf-00f9-49dc-a3e9-5e34715d8ad7/c1648485/index.html](https://sites.super.myninja.ai/a83ebbbf-00f9-49dc-a3e9-5e34715d8ad7/c1648485/index.html)

![Tier comparison](previews/tier_comparison.png)

* * *

## 🐑 Realistic-fur & quality pass (latest)

The coats were rebuilt to read as **real fur**, not smooth plastic or lumpy skin:

| Feature | Before | Now |
| --- | --- | --- |
| Coat surface | flat / noisy | **fine directional fur normal map** — dense combed strands (~260 across the tile) with only a whisper of clumping and micro grain, auto-normalised so the relief actually reads |
| Hair | coarse | **long-strand hair normal map** on mane / tail / forelock / feathers |
| Mane | 34 locks | **46 locks**, fuller and more varied, with a gentle drape curve |
| Tail / forelock | 24 / 13 | 24 / 13 locks (kept), finer strand normal |
| Fetlocks | none | **fetlock feather tufts** — 11 long strands on each lower leg (44 total) |
| Face | plain | **brow ridge** above each eye |
| Coat shading | opaque | **sheen + subsurface scattering** so the coat catches light like hair |
| Detail maps | coarse blotches | finer, subtler colour + roughness variation (no more “wrinkled” look) |

The key fix: the first fur normal map was **too high-frequency to be visible** (tiny gradients → flat normals), then over-corrected into **large lumps that read as wrinkles**. The final version auto-scales the height-field gradient to a target slope and uses a high strand density with minimal low-frequency clumping — so it reads as fine fur grain.

* * *

## ✨ HD detail pass

| Feature | Before | Now |
| --- | --- | --- |
| Body mesh | ~20 k tris | **90–109 k tris** (finer voxel remesh, denser anatomy) |
| Anatomy | single lofted tube | **muscle masses** (withers, shoulder, haunch), sculpted **jaw / cheek / brow / muzzle**, nostril flares, widening hoof caps |
| Hair | one mane tube + tail tube | **flowing mane, tail, forelock and fetlock feathers** built from ~127 individual hair strands (separate skinned meshes) |
| Surface | flat shading only | **procedural tangent-space normal maps** (fur grain + directional hair flow) |
| Skin | opaque | **subsurface scattering** + sheen on the coat |
| Depth | none | **baked ambient occlusion** multiplied into the vertex colours |
| Roughness | constant | **roughness-variation map** |
| Textures | 512 px | up to **2048 px** (fur normal map) |

All of it survives glTF export — the normal maps, roughness maps and vertex colours are embedded in the GLB, so the extra detail shows up in-engine, not just in Blender.

* * *

## 📦 What's in the pack

```
dist/
  horse_weak.glb      Tier 1 — broken-down nag            (~15.2 MB, 90 k tris)
  horse_better.glb    Tier 2 — solid steed                (~15.7 MB, 98 k tris)
  horse_great.glb     Tier 3 — champion war horse         (~16.3 MB, 109 k tris)
viewer/
  index.html          Interactive three.js viewer (all 3 tiers, side by side)
  horse_*.glb         the three models, for the viewer
previews/             Turntable renders of every tier + comparison sheet
*.py                  The full procedural generation pipeline
```

Every GLB contains: a skinned mesh, one skeleton, embedded PBR textures (base colour, normal, roughness), vertex colours, and **three animation clips** (Idle / Walk / Gallop).

Open `viewer/index.html` (served over http) to inspect all three horses live — orbit the camera, switch the animation clip, and focus any tier.

* * *

## 🏆 The three upgrade tiers

|   
 | Tier 1 — Weak | Tier 2 — Better | Tier 3 — Great |
| --- | --- | --- | --- |
| **Look** | thin, dull nag | muscled steed | glossy chestnut champion |
| **Coat** | dull grey-brown | warm bay brown | deep glossy chestnut |
| **Tack** | none | leather bridle + saddle blanket | full gold lamellar armour + red velvet saddle |
| **Muscle scale** | 0.90× body / 0.82× legs | 1.00× | 1.07× body / 1.06× legs |
| **Material** | rough 0.90 (dull) | rough 0.55 | rough 0.33 + clear-coat (glossy) |

The differences are baked into the **geometry** (body/leg thickness), the **vertex-colour coat** (region shading: darker legs, lighter belly, black mane/tail, dark hooves, ambient occlusion) and the **materials**, so the upgrade is visible in-engine, not just in a texture swap.

* * *

## 🦴 Rig & animation

Every tier shares one clean, engine-friendly skeleton (~37 bones):

-   **Spine chain** — root → pelvis → spine → chest → neck1 → neck2 → head → muzzle
-   **Tail** — 3 bones
-   **Front legs** — shoulder → forearm → carpus → pastern → hoof (×2)
-   **Hind legs** — thigh → gaskin → hock → cannon → pastern → hoof (×2)

Three looping clips are baked into each GLB (24 fps):

| Clip | Frames | Description |
| --- | --- | --- |
| **Idle** | 96 | breathing, subtle head bob, tail swish |
| **Walk** | 24 | 4-beat walk cycle |
| **Gallop** | 16 | fast racing gallop with suspension |

All clips are in-place (no root translation) so they drop straight into a locomotion state-machine.

* * *

## 🎨 Textures & materials

-   **Coat** — per-vertex colour regions (legs, belly, mane, muzzle, hooves) multiplied by a procedural tiling detail map, with a **fur normal map**, **roughness-variation map**, **sheen** and **subsurface scattering**. Exported as `COLOR_0` + `baseColorTexture` + `normalTexture`.
-   **Hair** (mane / tail / forelock / feathers) — dark solid colour with a strong directional hair normal map and sheen.
-   **Armour** — physically-based gold (metallic), red velvet and leather, each with a normal map. The tint is **baked into the exported texture** so the gold / red-velvet / leather colour survives glTF export and renders identically in Blender and in any glTF engine (three.js, Unity, Unreal, Godot).
-   **Eyes** — dark glossy spheres.

Everything is packed into the GLB (textures embedded) — no external files needed.

* * *

## 🧩 Using the models

**three.js** (see `viewer/index.html`):

```js
const gltf = await new GLTFLoader().loadAsync('horse_great.glb');
const mixer = new THREE.AnimationMixer(gltf.scene);
gltf.animations.forEach(c => mixer.clipAction(c).play()); // Idle / Walk / Gallop
```

**Unity / Unreal / Godot** — drop the `.glb` in. The skinned mesh, skeleton, materials, embedded textures and the three animation clips are all imported automatically.

Scale is in **metres** (≈ 2.4 m long, ≈ 2.2 m tall), Y-up (glTF standard), origin at the hooves between the front legs.

* * *

## 🔧 Regenerating the assets

```bash
pip install numpy
blender --background --python build_hd.py          # HD build + export all tiers
```

Key modules:

| File | Purpose |
| --- | --- |
| `horse_lib.py` | bmesh lofting, voxel-remesh, decimate, UV helpers |
| `horse_model.py` | horse anatomy — stylised + **HD** builds, mane/tail/forelock/feather strands |
| `rig_lib.py` | armature + automatic skinning |
| `anim_lib.py` | procedural Idle / Walk / Gallop clips |
| `armor_lib.py` | Roman lamellar armour, plates, saddle, bridle |
| `material_lib.py` | procedural textures, **fur/hair normal maps**, PBR materials, **AO bake**, vertex-colour painting |
| `render_lib.py` | studio preview rendering (ground plane, GTAO) |
| `tiers.py` | the three tier definitions |
| `build_hd.py` | the HD pipeline entry point |

* * *

_Generated procedurally with Blender 3.4 · no third-party assets · free to use._