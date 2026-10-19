# Roman Racing Chariot — Game-Ready GLB Assets

Modular, low-poly Roman racing chariot with a swappable wheel upgrade system (standard → reinforced → spiked → bladed).

## Files

| File | What it is | Tris | Size |
| --- | --- | --- | --- |
| `RomanChariot.glb` | Assembled chariot, ready to drop in | 9,768 | ~198 KB |
| `RomanChariot_WheelKit.glb` | 4 wheel variants for swapping | 16,528 | ~292 KB |
| `preview.png` | Rendered preview of both assets | — | — |
| `Roman_Chariot_Design_Sheet.html` | Concept sheet (earlier deliverable) | — | — |

Both are **glTF 2.0 binary (.glb)**, self-contained (no external textures), with **normals included** and **PBR materials**.

## Technical specs

-   **Up axis:** Y (glTF standard). Forward faces **−Z**.
-   **Scale:** 1 unit = 1 metre. Wheel radius 0.65 m, wheelbase 1.40 m, overall length ≈ 2.8 m. Origin sits on the ground, centred under the axle — so the model drops straight onto a ground plane at y = 0.
-   **Materials (PBR, no textures):** `Wood`, `DarkWood`, `Bronze`, `Iron`, `Steel`, `Leather`.
-   No UVs are required (materials are flat-colour PBR). Add UVs only if you plan to texture.

## Node hierarchy — `RomanChariot.glb`

```
Chariot                 (group — all body parts)
├── Axle
├── Axle_Cap_L / Axle_Cap_R
├── CarBody_Wood        (curved horseshoe tub, open at back)
├── CarBody_DarkWood    (chassis block)
├── CarBody_Bronze      (top rail + studs + front emblem)
├── CarBody_Leather     (binding at the open ends)
├── DraughtPole
├── Pole_Band_25/50/75
├── Yoke
├── Yoke_Peg_L / Yoke_Peg_R
├── Handle_L / Handle_Grip_L
├── Handle_R / Handle_Grip_R
└── Footboard
Wheel_L                 (group — left wheel)
├── Wheel_L_Wood        (rim + spokes)
└── Wheel_L_Bronze      (hub + caps)
Wheel_R                 (group — right wheel)
├── Wheel_R_Wood
└── Wheel_R_Bronze
```

## Node hierarchy — `RomanChariot_WheelKit.glb`

Four wheels laid out in a row along X (centred on origin):

```
Wheel_Standard    (wood rim, wood spokes, bronze hub)
Wheel_Reinforced  (iron band, leather-bound spokes, larger bronze hub)
Wheel_Spiked      (reinforced + 12 iron spikes around the rim)
Wheel_Bladed      (reinforced + 4 curved steel scythe blades)
```

Each `Wheel_*` group contains its own `_Wood`, `_Bronze`, `_Iron`, `_Leather`, `_Steel` child meshes as needed.

## Swapping wheels in-game

The wheels are separate groups so you can swap them at runtime.

1.  Find the wheel group by name (`Wheel_L` / `Wheel_R`).
2.  Hide/destroy its children, then instantiate the desired variant from `RomanChariot_WheelKit.glb`.
3.  Match the transform: the wheel's local origin is its **hub centre**. In `RomanChariot.glb` the hubs sit at `(±0.70, 0.65, 0)` (build space) → after the Y-up export that is `(±0.70, 0.65, 0)`. Just parent the variant wheel to the same node and zero its local position/rotation.

**Tip:** if you prefer one file per wheel, re-export each `Wheel_*` group from `RomanChariot_WheelKit.glb` as its own `.glb` — they are independent.

### Quick pseudo-code (Unity / Unreal / three.js)

```
wheelL = chariot.find("Wheel_L")
wheelL.setActive(false)                       // hide standard wheel
spiked = instantiate("RomanChariot_WheelKit.glb/Wheel_Spiked")
spiked.parent = wheelL.parent
spiked.localPosition = wheelL.localPosition   // same hub anchor
```

## Import notes

-   **Unity:** drag the `.glb` in — the node names become GameObjects and the PBR materials import as URP/HDRP Lit materials. Enable _Read/Write_ only if you need runtime mesh edits.
-   **Unreal:** import as a Static Mesh; the named parts come through as separate meshes if you enable _Combine Meshes = off_.
-   **three.js / Babylon / Godot:** load directly with the standard glTF loader; traverse by `name` to grab parts.

## Regenerating / customising

Everything is generated procedurally by `../build_chariot.py` (needs `numpy`, `trimesh`, `shapely`). Tweak dimensions, spoke counts, spike/blade counts or colours there and re-run:

```bash
python3 build_chariot.py
```

Key knobs: `build_wheel(...)` (R, n\_spokes, spikes, blades), `build_car_body()` (radius, wall height), and the `MATS` colour table.