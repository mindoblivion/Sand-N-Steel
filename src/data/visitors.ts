/** Living City visitor catalogue. Pure authored data; no UI or persistence. */
export interface VisitorWindow { readonly from: number; readonly to: number }
export interface VisitorOffer { readonly summary: string; readonly pool: readonly string[] }
export interface Visitor {
  readonly id: string; readonly name: string; readonly title: string; readonly description: string;
  readonly cadence: number; readonly window: VisitorWindow; readonly bargainRate?: number; readonly offer: VisitorOffer;
}
export const VISITOR_CADENCE_MIN = 2;
export const VISITOR_CADENCE_MAX = 7;
export const VISITOR_WINDOW_MAX_DAY = 365;
export const VISITOR_OFFER_SLOTS = 1;
export const VISITORS: readonly Visitor[] = Object.freeze([
  Object.freeze({ id: 'numidian_bladesmith', name: 'Bostar of Cirta', title: 'Wandering Bladesmith',
    description: 'A Numidian smith who follows the games and grinds a fine edge in the shade of the gate.',
    cadence: 3, bargainRate: 0.7, window: Object.freeze({ from: 1, to: 150 }),
    offer: Object.freeze({ summary: 'A short blade ground on the whetstone of his own camp.',
      pool: Object.freeze(['dagger_pugio', 'dirk_desert']) }) }),
  Object.freeze({ id: 'campanian_armorer', name: 'Vibius the Campanian', title: 'Itinerant Armorer',
    description: 'A Campanian armourer with a mule cart of strapped bronze, in the city while the season lasts.',
    cadence: 4, bargainRate: 0.75, window: Object.freeze({ from: 6, to: 240 }),
    offer: Object.freeze({ summary: 'A single piece of worn bronze armor, offered from the cart.',
      pool: Object.freeze(['arms_manica', 'legs_greaves_bronze', 'helm_galea_iron']) }) }),
  Object.freeze({ id: 'emesan_weapon_trader', name: 'Zabdibel of Emesa', title: 'Caravan Trader',
    description: 'An Emesan trader whose caravan halts by the arena wall for as long as the water holds.',
    cadence: 5, bargainRate: 0.8, window: Object.freeze({ from: 24, to: 365 }),
    offer: Object.freeze({ summary: 'Eastern steel from the caravan, one piece unpacked at a time.',
      pool: Object.freeze(['bronze_mace', 'shamshir_curved', 'spatha_legion']) }) })
]);
export function getVisitor(id: string): Visitor | undefined { return VISITORS.find((visitor) => visitor.id === id); }
