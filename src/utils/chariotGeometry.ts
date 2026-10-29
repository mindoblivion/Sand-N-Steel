/**
 * Phase C-8.66B — chariot model geometry: the audited wheel fit.
 *
 * Everything here is measured from the two shipping assets, not from the
 * uploaded README.  The README's wheel-swap recipe is wrong for this project:
 * it says the kit wheel's local origin is its hub centre and that parenting it
 * with `localPosition = wheelL.localPosition` is enough, which would leave the
 * kit's own +3.75/+1.25 X layout offsets and its 0.75 hub height in place.
 *
 * ── WHAT THE ASSETS ACTUALLY SAY ────────────────────────────────────────────
 * Both files export from a Z-up build space through the SAME per-root node
 * matrix `[1,0,0,0, 0,0,−1,0, 0,1,0,0, 0,0,0,1]` (glTF is column-major), so
 * GLTFLoader hands back a Y-up scene and the bounds below are in that Y-up
 * frame — the frame three.js applies a `<group>` rotation and position in.
 *
 * RomanChariot.glb — 26 nodes, 9,768 triangles, materials DarkWood/Bronze/
 * Wood/Leather, no textures, no animations, no skins.
 *
 *   | node          | Y-up world bounds                        | reading          |
 *   |---------------|------------------------------------------|------------------|
 *   | whole model   | X ±0.768, Y −0.035 … 1.335, Z −2.107 … 0.685 | 2.792 long, 1.37 tall |
 *   | Axle          | X ±0.75, Y 0.605 … 0.695, Z ±0.045        | axle axis Y 0.65 |
 *   | Axle_Cap_L/R  | X ∓0.715 … ∓0.765, Y 0.585 … 0.715       | caps at ±0.74    |
 *   | Wheel_L group | X −0.735 … −0.665, Y −0.035 … 1.335, Z −0.685 … 0.685 | hub (−0.70, 0.65, 0) |
 *   | Wheel_R group | X  0.665 …  0.735, Y −0.035 … 1.335, Z −0.685 … 0.685 | hub ( 0.70, 0.65, 0) |
 *
 * So the fitted wheel's disc lies in the **YZ plane** (0.07 thick in X, 1.37 in
 * Y and Z), its hub centre is **(±0.70, 0.65, 0)**, and its rim radius is
 * **0.685** — which is why the assembled model's lowest point is **−0.035**:
 * the hub is 0.015 lower than the radius would suggest, i.e. the chariot as
 * authored already sinks its own tyres 0.035 below its y = 0 plane.  That is the
 * original fitted geometry, and the standard wheel set reproduces it exactly.
 *
 * RomanChariot_WheelKit.glb — 19 nodes, 16,528 triangles, one extra material
 * (Iron, Steel for the unsold variants).  The four variants lie in a row along
 * X, each a root group with its own mesh children, each wheel's disc in the
 * **XY plane** (0.07 thick in Z) — i.e. rotated 90° about Y relative to the
 * chariot's wheels — and each with its bronze hub centred on **kit Y 0.75**:
 *
 *   | variant           | X span          | hub X   | rim radius | kit bottom Y |
 *   |-------------------|-----------------|---------|------------|--------------|
 *   | Wheel_Standard    | −4.435 … −3.065 | −3.75   | 0.685      | 0.065        |
 *   | Wheel_Reinforced  | −1.935 … −0.565 | −1.25   | 0.7025     | 0.0475       |
 *   | Wheel_Spiked      |  0.565 …  1.935 |  1.25   | (0.8025)   | (unsold)     |
 *   | Wheel_Bladed      |  3.065 …  4.435 |  3.75   | (0.8429)   | (unsold)     |
 *
 * ── THE TRANSFORM, DERIVED ─────────────────────────────────────────────────
 * Placing the kit wheel means mapping its own hub onto the chariot's hub, at
 * the audited scale and yaw, in one wrapper transform
 * `p_world = position + Ry(yaw) · p_kit`:
 *
 *   1. **Scale** — 1.0.  Both assets are authored at 1 unit = 1 metre (wheel
 *      radius 0.685 m, overall 2.79 m), which is this game's world unit: the
 *      city's doorways are 2.2 units high and its first-person eye line is
 *      1.7.  No scale change is applied to either asset, so the fitted wheel is
 *      the size of the wheel it replaces (both rims measure 0.685).
 *   2. **Yaw** — `−π/2` about Y, which turns the kit's XY disc into the chariot's
 *      YZ disc (x, y, z → −z, y, x).  The wheel's own geometry is symmetric
 *      about its mid-plane (wood ±0.035, bronze ±0.068, iron ±0.0525,
 *      leather ±0.024), so the sign of the yaw is not load-bearing; it is
 *      pinned so the two sides cannot drift apart.
 *   3. **Per-variant offset** — `hub_target − Ry(yaw) · hub_kit`, carried by the
 *      wheel group's own `position`.  With `Ry(−π/2)·(kitHubX, 0.75, 0) =
 *      (0, 0.75, kitHubX)`, that is `(sideX, 0.65 − 0.75, 0 − kitHubX)`:
 *
 *      | variant+side | offset (X, Y, Z)          |
 *      |--------------|---------------------------|
 *      | standard L   | (−0.70, −0.10, +3.75)     |
 *      | standard R   | ( 0.70, −0.10, +3.75)     |
 *      | reinforced L | (−0.70, −0.10, +1.25)     |
 *      | reinforced R | ( 0.70, −0.10, +1.25)     |
 *
 *   4. **Hub alignment is exact for both variants.**  Both hubs land on
 *      `(±0.70, 0.65, 0)` — the axle's own axis height (0.605 … 0.695, centre
 *      0.65) and the stock wheel's hub X — because the offset is derived from the
 *      hub centres, never eyeballed, and no wheel is lifted to hide ground
 *      contact: raising one would detach its hub from the axle and is explicitly
 *      not done.
 *   5. **Bottom, measured rather than adjusted.**  A yaw about Y leaves Y
 *      untouched, so a variant's bottom is `kitBottomY − 0.10`:
 *
 *      | variant    | bottom Y | against the stock −0.035 |
 *      |------------|----------|--------------------------|
 *      | standard   | −0.035   | **0.0000 — the original fitted geometry, exactly** |
 *      | reinforced | −0.0525  | **−0.0175 — the known fit discrepancy, recorded** |
 *
 *      The reinforced rim is 0.0175 larger (r 0.7025 against 0.685), so an
 *      axle-centred reinforced wheel necessarily reaches 0.0175 lower.  It is
 *      recorded here and shown in the workshop preview rather than hidden by
 *      raising the wheel off its axle: the wheel stands on the same floor plane
 *      as the stock one and its tyre sinks past it by that much.
 */

import { assetUrl } from './assetUrl';
import * as THREE from 'three';
import { ChariotWheelVariantKey, ChariotFinishOverride } from '../data/chariotParts';

/** The modular chariot model (the fitted stock wheels are hidden when a kit set is mounted). */
export const CHARIOT_MODEL_URL = assetUrl('/_workspace_chariot_model_RomanChariot.glb');

/**
 * The wheel kit.  Loaded ON DEMAND by the workshop preview only — it is
 * deliberately NOT in `utils/preloadAssets.ts`' CORE_3D_ASSETS, so its 304 KB
 * never joins the startup payload.
 */
export const CHARIOT_WHEEL_KIT_URL = assetUrl('/_workspace_chariot_model_RomanChariot_WheelKit.glb');

/** The measured game scale for both assets (1 world unit = 1 metre; neither is rescaled). */
export const CHARIOT_MODEL_SCALE = 1;

/** The chariot's fitted wheel hub: X ±0.70, on the axle's own axis at Y 0.65. */
export const CHARIOT_WHEEL_HUB_X = 0.7;
export const CHARIOT_WHEEL_HUB_Y = 0.65;

/** The assembled chariot's lowest point (its own fitted wheels) — the standard wheel set's bottom. */
export const CHARIOT_STOCK_WHEEL_BOTTOM_Y = -0.035;

/** Every kit variant centres its bronze hub on this height. */
export const CHARIOT_WHEEL_KIT_HUB_Y = 0.75;

/** The 90° yaw that turns a kit wheel's XY disc onto the chariot's YZ disc. */
export const CHARIOT_WHEEL_YAW = -Math.PI / 2;

/** The chariot's own wheel group names — hidden while a kit wheel set is mounted. */
export const CHARIOT_STOCK_WHEEL_NODES = ['Wheel_L', 'Wheel_R'] as const;

export type ChariotWheelSide = 'left' | 'right';

export interface ChariotWheelVariant {
  /** Kit node to mount. */
  node: string;
  /** The variant's hub X in the kit's own layout (the row offset). */
  kitHubX: number;
  /** Measured rim radius, from the variant's own widest mesh. */
  radius: number;
  /** The variant's lowest Y in the kit's own frame. */
  kitBottomY: number;
}

/**
 * The two wheel variants the workshop sells, with the measurements above.
 * Spiked and Bladed are absent on purpose (see `data/chariotParts.ts`).
 */
export const CHARIOT_WHEEL_VARIANTS: Record<ChariotWheelVariantKey, ChariotWheelVariant> = {
  standard: { node: 'Wheel_Standard', kitHubX: -3.75, radius: 0.685, kitBottomY: 0.065 },
  reinforced: { node: 'Wheel_Reinforced', kitHubX: -1.25, radius: 0.7025, kitBottomY: 0.0475 },
};

export interface ChariotWheelPlacement {
  /** The wrapper group's position (the per-variant, per-side offset). */
  position: [number, number, number];
  /** The wrapper group's Y rotation. */
  rotationY: number;
  /** Where the hub ends up — the chariot's axle hub, for both variants. */
  hub: [number, number, number];
  /** Where the tyre's lowest point ends up. */
  bottomY: number;
  /** `bottomY` against the stock wheel's own bottom; negative means it sinks deeper. */
  bottomDelta: number;
}

/**
 * The audited transform for one wheel variant on one side.  Pure arithmetic over
 * the constants above — the suite re-derives every figure from the assets and
 * compares it here.
 */
export function getChariotWheelPlacement(
  variant: ChariotWheelVariantKey,
  side: ChariotWheelSide
): ChariotWheelPlacement {
  const spec = CHARIOT_WHEEL_VARIANTS[variant];
  const hubX = side === 'left' ? -CHARIOT_WHEEL_HUB_X : CHARIOT_WHEEL_HUB_X;
  const cosYaw = Math.cos(CHARIOT_WHEEL_YAW);
  const sinYaw = Math.sin(CHARIOT_WHEEL_YAW);

  // Ry(yaw) applied to the kit hub (kitHubX, kitHubY, 0).
  const rotatedHubX = spec.kitHubX * cosYaw;
  const rotatedHubZ = -spec.kitHubX * sinYaw;

  const position: [number, number, number] = [
    hubX - rotatedHubX,
    CHARIOT_WHEEL_HUB_Y - CHARIOT_WHEEL_KIT_HUB_Y,
    0 - rotatedHubZ,
  ];

  return {
    position,
    rotationY: CHARIOT_WHEEL_YAW,
    hub: [position[0] + rotatedHubX, position[1] + CHARIOT_WHEEL_KIT_HUB_Y, position[2] + rotatedHubZ],
    bottomY: position[1] + spec.kitBottomY,
    bottomDelta: position[1] + spec.kitBottomY - CHARIOT_STOCK_WHEEL_BOTTOM_Y,
  };
}

/**
 * Apply a finish's material overrides to ONE cloned chariot scene.
 *
 * `data/chariotParts.ts` is the single source of what a finish recolors (a
 * catalogue part carries its own `overrides` list), so the preview never keeps
 * a second copy of those colours.  Only the CLONE passed in is touched, and each
 * matched material is cloned before its colour is changed, so the shared
 * `useGLTF` scene other components see is never mutated.
 */
export function applyChariotFinish(
  root: THREE.Object3D,
  overrides: ChariotFinishOverride[]
): void {
  if (overrides.length === 0) return;
  const byMaterialName = new Map(overrides.map((o) => [o.material, o]));

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = materials.map((material) => {
      const override = byMaterialName.get(material.name);
      if (!override) return material;
      const clone = material.clone() as THREE.MeshStandardMaterial;
      if ('color' in clone && clone.color) clone.color.set(override.color);
      if (override.roughness !== undefined) clone.roughness = override.roughness;
      if (override.metalness !== undefined) clone.metalness = override.metalness;
      return clone;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
}
