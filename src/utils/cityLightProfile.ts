/**
 * The city's light profile — the rig the 3D city is drawn under, as named values
 * rather than literals scattered through the scene.
 *
 * ── WHY IT IS NAMED ──────────────────────────────────────────────────────
 * The city had one rig, spelled as literals in `CityHubScene` (the Sky, the fog, the
 * hemisphere light, the key light, the counter fill and the environment intensity).
 * A second rig is now needed for exactly one beat — the gladiator's oath, sworn at
 * dawn — and the house pattern for that is one named resolver whose body is the thing
 * a later slice replaces (`useTitlePhaseBackdrop` does the same for the title's
 * phase): `resolveCityLightProfile(profile)` is total and pure, every call answering
 * the same values for the same name.
 *
 * ── `day` IS THE RIG THE CITY ALREADY HAD ────────────────────────────────
 * Every `day` value below is the literal the scene carried before this slice, moved
 * — not retuned — so the default presentation is unchanged to the digit, and a caller
 * that passes no profile gets exactly the city the player has always seen. The suite
 * pins those values against the ones the file used to spell out.
 *
 * ── `oathDawn` IS A DAWN, NOT A DARKENING ────────────────────────────────
 * A low eastern sun (the key light's own direction, which the Sky, the shadow light
 * and the warm Lightformer all follow by construction), warmer haze and fog, and a
 * slightly lower fill — low enough to read as first light, high enough that the yard
 * the oath is sworn in stays legible. It is presentation only: no geometry, no
 * material, no shadow-map setting and no player-facing value depends on it.
 */

/** The rigs the city can be drawn under. Two exist today. */
export type CityLightProfile = 'day' | 'oathDawn';

export interface CityLightProfileValues {
  /** The key light's own direction: the Sky's sun, the shadow light and the warm Lightformer. */
  sunPosition: [number, number, number];
  /** The atmosphere the `<Sky>` is drawn with. */
  skyTurbidity: number;
  skyRayleigh: number;
  skyMieCoefficient: number;
  /** The horizon fog: colour and its near/far band. */
  fogColor: string;
  fogNear: number;
  fogFar: number;
  /** The hemisphere light: sky colour, ground bounce, intensity. */
  ambientSky: string;
  ambientGround: string;
  ambientIntensity: number;
  /** The shadow-casting key light. */
  keyColor: string;
  keyIntensity: number;
  /** The cool counter-fill. */
  fillColor: string;
  fillIntensity: number;
  /** The procedural environment's intensity. */
  environmentIntensity: number;
}

/**
 * The Mediterranean midday the city has always been drawn in — the scene's own
 * literals, unchanged.
 */
export const DAY_LIGHT: CityLightProfileValues = {
  sunPosition: [30, 42, 22],
  skyTurbidity: 7,
  skyRayleigh: 1.8,
  skyMieCoefficient: 0.005,
  fogColor: '#e3dbc6',
  fogNear: 45,
  fogFar: 160,
  ambientSky: '#fef3c7',
  ambientGround: '#8a7a5f',
  ambientIntensity: 0.45,
  keyColor: '#fffbeb',
  keyIntensity: 2.15,
  fillColor: '#7dd3fc',
  fillIntensity: 0.28,
  environmentIntensity: 0.35,
};

/**
 * First light over the Ludus Martial Yard: the sun low in the east, the sky reddened
 * (a higher turbidity and rayleigh, a thicker mie haze), a shorter fog band so the
 * city recedes into a dawn, and a warmer, weaker key with a cooler fill — long
 * shadows, and a scene still lit well enough to read the yard the recruit is kneeling
 * in.
 */
export const OATH_DAWN_LIGHT: CityLightProfileValues = {
  sunPosition: [36, 7, 18],
  skyTurbidity: 12,
  skyRayleigh: 3.4,
  skyMieCoefficient: 0.012,
  fogColor: '#e7c6ad',
  fogNear: 30,
  fogFar: 140,
  ambientSky: '#ffd9b0',
  ambientGround: '#6f5a45',
  ambientIntensity: 0.5,
  keyColor: '#ffb877',
  keyIntensity: 1.25,
  fillColor: '#8fb8e0',
  fillIntensity: 0.22,
  environmentIntensity: 0.3,
};

/**
 * The named resolver. Total: anything that is not `oathDawn` — including a missing
 * name — answers the day rig, so an unknown value can never leave the city unlit.
 * Returns a module constant, so its reference is stable for a given profile and a
 * consumer's memo does not churn.
 */
export function resolveCityLightProfile(profile?: CityLightProfile): CityLightProfileValues {
  return profile === 'oathDawn' ? OATH_DAWN_LIGHT : DAY_LIGHT;
}
