/**
 * cityLayoutBlueprint.ts — Validated 500×500 Roman City Blueprint & Asset Mapping (Step 1).
 *
 * Single source of truth for:
 *   1. The 500×500 road network (4 main 12-unit arteries + 4 secondary 6-unit streets).
 *   2. The 11 core buildings with world positions, Y-rotations (+Z local forward
 *      facing directly onto their serving road with a 2-unit setback), and footprints.
 *   3. The 29 placeholder props & waypoints (20 streetlamps, 4 market stalls,
 *      5 fast-travel shrines).
 *   4. The Three.js Asset Normalization Mapping that mounts each existing 3D
 *      building component (which carries its legacy local offset, door orientation,
 *      and authored scale) cleanly centered at [0, 0, 0], facing +Z, and fitted
 *      inside its blueprint footprint.
 */

export type BlueprintRoadType = 'main_artery' | 'secondary_street';

export interface BlueprintRoad {
  id: string;
  label: string;
  type: BlueprintRoadType;
  width: number;
  start: [number, number];
  end: [number, number];
}

export type BlueprintBuildingId =
  | 'bldg_central_plaza'
  | 'bldg_castle_motte'
  | 'bldg_colosseum'
  | 'bldg_ludus'
  | 'bldg_circus_maximus'
  | 'bldg_tavern'
  | 'bldg_forge'
  | 'bldg_shop_1'
  | 'bldg_shop_2'
  | 'bldg_shop_3'
  | 'bldg_library'
  | 'bldg_insula_1'
  | 'bldg_insula_2'
  | 'bldg_insula_3'
  | 'bldg_insula_4'
  | 'bldg_insula_5'
  | 'bldg_insula_6'
  | 'bldg_well_courtyard'
  | 'bldg_temple_fortuna'
  | 'bldg_watch_barracks'
  | 'bldg_domus_1'
  | 'bldg_domus_2'
  | 'bldg_domus_3'
  | 'bldg_domus_4';

export interface BlueprintBuilding {
  id: BlueprintBuildingId;
  name: string;
  district: string;
  position: [number, number, number];
  rotationY_radians: number;
  footprint: [number, number];
}

export type BlueprintPropKind = 'streetlamp' | 'market_stall' | 'fast_travel_shrine';

export interface BlueprintProp {
  id: string;
  label: string;
  kind: BlueprintPropKind;
  position: [number, number, number];
  footprint: [number, number];
  height: number;
}

export interface CityLayoutBlueprint {
  world: {
    size: [number, number];
    centered: [number, number, number];
  };
  roads: BlueprintRoad[];
  buildings: BlueprintBuilding[];
  props_and_waypoints: {
    streetlamps: BlueprintProp[];
    market_stalls: BlueprintProp[];
    fast_travel_shrines: BlueprintProp[];
  };
}

export interface BuildingAssetMapping {
  blueprintId: BlueprintBuildingId;
  assetComponent: string;
  /** Offset applied inside the normalization group to cancel legacy component world position. */
  cancelLegacyOffset: [number, number, number];
  /** Yaw rotation (radians) needed to turn the asset's front door onto local +Z. */
  localYawToPlusZ: number;
  /** Non-uniform scale fitting the legacy asset inside the blueprint footprint [w, d]. */
  scale: [number, number, number];
  /** Optional collision carveout behavior. */
  colliderStyle:
    | 'solid_box'
    | 'fountain_center'
    | 'citadel_motte'
    | 'colosseum_portal'
    | 'well_courtyard'
    | 'barracks_courtyard';
}

export const CITADEL_SUMMIT_Y = 8;
export const CITADEL_RAMP_START_Z = -133;
export const CITADEL_RAMP_END_Z = -161;
export const CITADEL_RAMP_HALF_WIDTH = 3.8;
export const CITADEL_SUMMIT_CENTER_Z = -180;
export const CITADEL_SUMMIT_HALF_X = 24;
export const CITADEL_SUMMIT_MIN_Z = -212;

export const CITY_LAYOUT_BLUEPRINT: CityLayoutBlueprint = {
  world: {
    size: [500, 500],
    centered: [0, 0, 0],
  },
  roads: [
    {
      id: 'road_main_north',
      label: 'Via Triumphalis North (Citadel Artery)',
      type: 'main_artery',
      width: 12,
      start: [0, -12.5],
      end: [0, -133],
    },
    {
      id: 'road_main_south',
      label: 'Via Appia South (Colosseum Artery)',
      type: 'main_artery',
      width: 12,
      start: [0, 12.5],
      end: [0, 200],
    },
    {
      id: 'road_main_west',
      label: 'Via Mercatoria West (Market Artery)',
      type: 'main_artery',
      width: 12,
      start: [-12.5, 0],
      end: [-200, 0],
    },
    {
      id: 'road_main_east',
      label: 'Via Scholaris East (Civic Artery)',
      type: 'main_artery',
      width: 12,
      start: [12.5, 0],
      end: [200, 0],
    },
    {
      id: 'road_sec_circus_ave',
      label: 'Circus Avenue',
      type: 'secondary_street',
      width: 6,
      start: [6, 40],
      end: [185, 40],
    },
    {
      id: 'road_sec_ludus_way',
      label: 'Ludus Way',
      type: 'secondary_street',
      width: 6,
      start: [-6, 123],
      end: [-120, 123],
    },
    {
      id: 'road_sec_market_north',
      label: 'North Market Street',
      type: 'secondary_street',
      width: 6,
      start: [-100, -6],
      end: [-100, -100],
    },
    {
      id: 'road_sec_civic_north',
      label: 'North Civic Street',
      type: 'secondary_street',
      width: 6,
      start: [80, -6],
      end: [80, -100],
    },
    // Step 3: Northwest Lower Slums cross-alleys (5u wide)
    {
      id: 'road_alley_slums_south',
      label: 'Subura South Alley',
      type: 'secondary_street',
      width: 5,
      start: [-155, -55],
      end: [-60, -55],
    },
    {
      id: 'road_alley_slums_north',
      label: 'Subura North Alley',
      type: 'secondary_street',
      width: 5,
      start: [-140, -95],
      end: [-60, -95],
    },
    // Step 3: Northeast Civic & Patrician avenues
    {
      id: 'road_alley_civic_east',
      label: 'Via Fortuna (Patrician Avenue)',
      type: 'secondary_street',
      width: 6,
      start: [80, -60],
      end: [176, -60],
    },
    {
      id: 'road_alley_patrician_north',
      label: 'Patrician Terrace Lane',
      type: 'secondary_street',
      width: 5,
      start: [128, -60],
      end: [128, -116],
    },
  ],
  buildings: [
    {
      id: 'bldg_central_plaza',
      name: 'Central Fountain / Plaza',
      district: 'City Center',
      position: [0, 0, 0],
      rotationY_radians: 0,
      footprint: [25, 25],
    },
    {
      id: 'bldg_castle_motte',
      name: 'Castle on a Motte (with Moat & Drawbridge)',
      district: 'High-ground Citadel',
      position: [0, 8, -180],
      rotationY_radians: 0,
      footprint: [90, 90],
    },
    {
      id: 'bldg_colosseum',
      name: 'Colosseum / Arena',
      district: 'Entertainment / Gladiator District',
      position: [-48, 0, 76],
      rotationY_radians: 1.570796,
      footprint: [80, 80],
    },
    {
      id: 'bldg_ludus',
      name: 'Ludus / Training School',
      district: 'Entertainment / Gladiator District',
      position: [-48, 0, 143],
      rotationY_radians: 3.141593,
      footprint: [35, 30],
    },
    {
      id: 'bldg_circus_maximus',
      name: 'Circus Maximus / Track',
      district: 'Outer Entertainment District',
      position: [110, 0, 70],
      rotationY_radians: 3.141593,
      footprint: [140, 50],
    },
    {
      id: 'bldg_tavern',
      name: 'Tavern / Pub',
      district: 'Market / Social District',
      position: [-38, 0, 17],
      rotationY_radians: 3.141593,
      footprint: [24, 18],
    },
    {
      id: 'bldg_forge',
      name: 'Forge & Smithy',
      district: 'Artisan / Market District',
      position: [-70, 0, 16],
      rotationY_radians: 3.141593,
      footprint: [22, 16],
    },
    {
      id: 'bldg_shop_1',
      name: 'General Shop 1',
      district: 'Market / Social District',
      position: [-35, 0, -14],
      rotationY_radians: 0,
      footprint: [14, 12],
    },
    {
      id: 'bldg_shop_2',
      name: 'General Shop 2',
      district: 'Market / Social District',
      position: [-55, 0, -14],
      rotationY_radians: 0,
      footprint: [14, 12],
    },
    {
      id: 'bldg_shop_3',
      name: 'General Shop 3',
      district: 'Market / Social District',
      position: [-75, 0, -14],
      rotationY_radians: 0,
      footprint: [14, 12],
    },
    {
      id: 'bldg_library',
      name: 'Library',
      district: 'Civic / Scholar District',
      position: [45, 0, -18],
      rotationY_radians: 0,
      footprint: [26, 20],
    },
    // Step 3 — Northwest Lower Slums & Working Quarter
    {
      id: 'bldg_insula_1',
      name: 'Insula of the Weavers',
      district: 'Northwest Lower Slums',
      position: [-116, 0, -67],
      rotationY_radians: 0,
      footprint: [18, 14],
    },
    {
      id: 'bldg_insula_2',
      name: 'Insula of the Bakers',
      district: 'Northwest Lower Slums',
      position: [-120, 0, -42],
      rotationY_radians: Math.PI,
      footprint: [22, 16],
    },
    {
      id: 'bldg_insula_3',
      name: 'Insula of the Fullers',
      district: 'Northwest Lower Slums',
      position: [-82, 0, -43],
      rotationY_radians: Math.PI,
      footprint: [18, 14],
    },
    {
      id: 'bldg_insula_4',
      name: 'Northgate Tenement',
      district: 'Northwest Lower Slums',
      position: [-118, 0, -108],
      rotationY_radians: 0,
      footprint: [22, 16],
    },
    {
      id: 'bldg_insula_5',
      name: 'Ashlar Quarter Insula',
      district: 'Northwest Lower Slums',
      position: [-84, 0, -107],
      rotationY_radians: 0,
      footprint: [18, 14],
    },
    {
      id: 'bldg_insula_6',
      name: 'West Wall Tenement',
      district: 'Northwest Lower Slums',
      position: [-142, 0, -67],
      rotationY_radians: 0,
      footprint: [18, 14],
    },
    {
      id: 'bldg_well_courtyard',
      name: 'Communal Well & Washbasin Courtyard',
      district: 'Northwest Lower Slums',
      position: [-87, 0, -66],
      rotationY_radians: 0,
      footprint: [12, 12],
    },
    // Step 3 — Northeast Temple, Watch Barracks & Patrician Quarter
    {
      id: 'bldg_temple_fortuna',
      name: 'Temple of Fortuna',
      district: 'Northeast Sacred & Civic Quarter',
      position: [63, 0, -60],
      rotationY_radians: Math.PI / 2,
      footprint: [28, 22],
    },
    {
      id: 'bldg_watch_barracks',
      name: 'City Watch Barracks & Training Yard',
      district: 'Northeast Sacred & Civic Quarter',
      position: [104, 0, -79],
      rotationY_radians: 0,
      footprint: [34, 26],
    },
    {
      id: 'bldg_domus_1',
      name: 'Domus Valeria',
      district: 'Northeast Patrician Quarter',
      position: [145, 0, -76],
      rotationY_radians: 0,
      footprint: [24, 20],
    },
    {
      id: 'bldg_domus_2',
      name: 'Domus Aurelia',
      district: 'Northeast Patrician Quarter',
      position: [145, 0, -106],
      rotationY_radians: -Math.PI / 2,
      footprint: [24, 20],
    },
    {
      id: 'bldg_domus_3',
      name: 'Domus Cornelia',
      district: 'Northeast Patrician Quarter',
      position: [134, 0, -44],
      rotationY_radians: Math.PI,
      footprint: [24, 20],
    },
    {
      id: 'bldg_domus_4',
      name: 'Domus Cassia',
      district: 'Northeast Patrician Quarter',
      position: [166, 0, -44],
      rotationY_radians: Math.PI,
      footprint: [24, 20],
    },
  ],
  props_and_waypoints: {
    streetlamps: [
      { id: 'lamp_n_01', label: 'North Artery Lamp W1', kind: 'streetlamp', position: [-7.2, 0, -35], footprint: [1, 1], height: 4.2 },
      { id: 'lamp_n_02', label: 'North Artery Lamp E1', kind: 'streetlamp', position: [7.2, 0, -35], footprint: [1, 1], height: 4.2 },
      { id: 'lamp_n_03', label: 'North Artery Lamp W2', kind: 'streetlamp', position: [-7.2, 0, -75], footprint: [1, 1], height: 4.2 },
      { id: 'lamp_n_04', label: 'North Artery Lamp E2', kind: 'streetlamp', position: [7.2, 0, -75], footprint: [1, 1], height: 4.2 },
      { id: 'lamp_n_05', label: 'North Artery Lamp W3', kind: 'streetlamp', position: [-7.2, 0, -115], footprint: [1, 1], height: 4.2 },
      { id: 'lamp_n_06', label: 'North Artery Lamp E3', kind: 'streetlamp', position: [7.2, 0, -115], footprint: [1, 1], height: 4.2 },
      { id: 'lamp_s_01', label: 'South Artery Lamp E1', kind: 'streetlamp', position: [7.2, 0, 30], footprint: [1, 1], height: 4.2 },
      { id: 'lamp_s_02', label: 'South Artery Lamp W1', kind: 'streetlamp', position: [-7.2, 0, 30], footprint: [1, 1], height: 4.2 },
      { id: 'lamp_s_03', label: 'South Artery Lamp E2', kind: 'streetlamp', position: [7.2, 0, 76], footprint: [1, 1], height: 4.2 },
      { id: 'lamp_s_04', label: 'South Artery Lamp E3', kind: 'streetlamp', position: [7.2, 0, 115], footprint: [1, 1], height: 4.2 },
      { id: 'lamp_s_05', label: 'South Artery Lamp E4', kind: 'streetlamp', position: [7.2, 0, 155], footprint: [1, 1], height: 4.2 },
      { id: 'lamp_w_01', label: 'Market Lamp N1', kind: 'streetlamp', position: [-22, 0, -7.2], footprint: [1, 1], height: 4.2 },
      { id: 'lamp_w_02', label: 'Market Lamp S1', kind: 'streetlamp', position: [-22, 0, 7.2], footprint: [1, 1], height: 4.2 },
      { id: 'lamp_w_03', label: 'Market Lamp N2', kind: 'streetlamp', position: [-45, 0, -7.2], footprint: [1, 1], height: 4.2 },
      { id: 'lamp_w_04', label: 'Market Lamp S2', kind: 'streetlamp', position: [-54, 0, 7.2], footprint: [1, 1], height: 4.2 },
      { id: 'lamp_w_05', label: 'Market Lamp N3', kind: 'streetlamp', position: [-65, 0, -7.2], footprint: [1, 1], height: 4.2 },
      { id: 'lamp_e_01', label: 'Civic Lamp S1', kind: 'streetlamp', position: [25, 0, 7.2], footprint: [1, 1], height: 4.2 },
      { id: 'lamp_e_02', label: 'Civic Lamp S2', kind: 'streetlamp', position: [65, 0, 7.2], footprint: [1, 1], height: 4.2 },
      { id: 'lamp_circus_01', label: 'Circus Avenue Lamp 1', kind: 'streetlamp', position: [65, 0, 35.5], footprint: [1, 1], height: 4.2 },
      { id: 'lamp_ludus_01', label: 'Ludus Way Lamp 1', kind: 'streetlamp', position: [-48, 0, 118.5], footprint: [1, 1], height: 4.2 },
      // Step 3 North District streetlamps
      { id: 'lamp_slum_01', label: 'Subura West Lamp', kind: 'streetlamp', position: [-136, 0, -58.8], footprint: [1, 1], height: 4.0 },
      { id: 'lamp_slum_02', label: 'Subura Junction Lamp', kind: 'streetlamp', position: [-104.2, 0, -58.8], footprint: [1, 1], height: 4.0 },
      { id: 'lamp_slum_03', label: 'Subura East Lamp', kind: 'streetlamp', position: [-72, 0, -58.8], footprint: [1, 1], height: 4.0 },
      { id: 'lamp_slum_04', label: 'Subura North Lamp', kind: 'streetlamp', position: [-104.2, 0, -98.8], footprint: [1, 1], height: 4.0 },
      { id: 'lamp_civic_01', label: 'Fortuna Steps Lamp', kind: 'streetlamp', position: [75.8, 0, -44.5], footprint: [1, 1], height: 4.2 },
      { id: 'lamp_civic_02', label: 'Barracks Gate Lamp', kind: 'streetlamp', position: [98, 0, -64.2], footprint: [1, 1], height: 4.2 },
      { id: 'lamp_civic_03', label: 'Patrician Ave Lamp 1', kind: 'streetlamp', position: [132, 0, -64.2], footprint: [1, 1], height: 4.2 },
      { id: 'lamp_civic_04', label: 'Patrician Ave Lamp 2', kind: 'streetlamp', position: [160, 0, -55.8], footprint: [1, 1], height: 4.2 },
    ],
    market_stalls: [
      { id: 'stall_01', label: 'Spice & Amphora Stall', kind: 'market_stall', position: [-54.5, 0, 12], footprint: [3, 2], height: 2.6 },
      { id: 'stall_02', label: 'Wineskin & Bread Stall', kind: 'market_stall', position: [-54.5, 0, 18], footprint: [3, 2], height: 2.6 },
      { id: 'stall_03', label: 'Linen & Tunic Stall', kind: 'market_stall', position: [-45, 0, -13], footprint: [3, 2], height: 2.6 },
      { id: 'stall_04', label: 'Bronze Trinket Stall', kind: 'market_stall', position: [-65, 0, -13], footprint: [3, 2], height: 2.6 },
      { id: 'stall_slums_01', label: 'Subura Grain & Olive Cart', kind: 'market_stall', position: [-136, 0, -51.0], footprint: [3, 2], height: 2.5 },
      { id: 'stall_slums_02', label: 'Subura Clay Jug Stall', kind: 'market_stall', position: [-76, 0, -90.8], footprint: [3, 2], height: 2.5 },
    ],
    fast_travel_shrines: [
      { id: 'shrine_central_plaza', label: 'Central Plaza Shrine', kind: 'fast_travel_shrine', position: [15, 0, 15], footprint: [2.5, 2.5], height: 3.4 },
      { id: 'shrine_citadel_approach', label: 'Citadel Approach Shrine', kind: 'fast_travel_shrine', position: [9.5, 0, -127], footprint: [2.5, 2.5], height: 3.4 },
      { id: 'shrine_gladiator_quarter', label: 'Colosseum Gate Shrine', kind: 'fast_travel_shrine', position: [9.5, 0, 76], footprint: [2.5, 2.5], height: 3.4 },
      { id: 'shrine_market_square', label: 'Market Square Shrine', kind: 'fast_travel_shrine', position: [-20, 0, -11], footprint: [2.5, 2.5], height: 3.4 },
      { id: 'shrine_circus_promenade', label: 'Circus Promenade Shrine', kind: 'fast_travel_shrine', position: [26, 0, 33.5], footprint: [2.5, 2.5], height: 3.4 },
      { id: 'shrine_fortuna_plaza', label: 'Temple of Fortuna Luck Shrine', kind: 'fast_travel_shrine', position: [75.2, 0, -77.5], footprint: [2.5, 2.5], height: 3.6 },
      { id: 'shrine_north_slums', label: 'Subura Crossroads Shrine', kind: 'fast_travel_shrine', position: [-76, 0, -59.2], footprint: [2.5, 2.5], height: 3.4 },
    ],
  },
};

/**
 * Verified Three.js Asset Mapping Table:
 * Maps each blueprint building ID to the existing R3F building component and
 * normalizes its legacy origin, forward axis (+Z), and footprint scale.
 */
export const BLUEPRINT_BUILDING_ASSETS: Record<BlueprintBuildingId, BuildingAssetMapping> = {
  bldg_central_plaza: {
    blueprintId: 'bldg_central_plaza',
    assetComponent: 'ForumFountain',
    cancelLegacyOffset: [-10, 0, -30],
    localYawToPlusZ: 0,
    scale: [1.35, 1.35, 1.35],
    colliderStyle: 'fountain_center',
  },
  bldg_castle_motte: {
    blueprintId: 'bldg_castle_motte',
    assetComponent: 'NorthernMotte + NorthernFortress + Drawbridge',
    cancelLegacyOffset: [0, 0, 81.5],
    localYawToPlusZ: 0,
    scale: [1.4, 8 / 4.7175, 1.4],
    colliderStyle: 'citadel_motte',
  },
  bldg_colosseum: {
    blueprintId: 'bldg_colosseum',
    assetComponent: 'GrandColosseum',
    cancelLegacyOffset: [0, 0, 25],
    localYawToPlusZ: 0,
    scale: [1.95, 1.45, 1.95],
    colliderStyle: 'colosseum_portal',
  },
  bldg_ludus: {
    blueprintId: 'bldg_ludus',
    assetComponent: 'GladiatorAcademy',
    cancelLegacyOffset: [-30.5, 0, 27],
    localYawToPlusZ: Math.PI / 2,
    scale: [3.2, 2.2, 3.2],
    colliderStyle: 'solid_box',
  },
  bldg_circus_maximus: {
    blueprintId: 'bldg_circus_maximus',
    assetComponent: 'EastCircusArena',
    cancelLegacyOffset: [-51.972, 0, -7.9215],
    localYawToPlusZ: Math.PI / 2,
    scale: [1.76, 1.5, 1.66],
    colliderStyle: 'solid_box',
  },
  bldg_tavern: {
    blueprintId: 'bldg_tavern',
    assetComponent: 'CityTavern',
    cancelLegacyOffset: [16, 0, -14],
    localYawToPlusZ: -Math.PI / 2,
    scale: [2.0, 1.4, 1.8],
    colliderStyle: 'solid_box',
  },
  bldg_forge: {
    blueprintId: 'bldg_forge',
    assetComponent: 'SmithingForge',
    cancelLegacyOffset: [-18, 0, -2.6],
    localYawToPlusZ: Math.PI / 2,
    scale: [1.9, 1.3, 1.5],
    colliderStyle: 'solid_box',
  },
  bldg_shop_1: {
    blueprintId: 'bldg_shop_1',
    assetComponent: 'GeneralStore',
    cancelLegacyOffset: [-22, 0, 5],
    localYawToPlusZ: Math.PI / 2,
    scale: [1.4, 1.15, 0.98],
    colliderStyle: 'solid_box',
  },
  bldg_shop_2: {
    blueprintId: 'bldg_shop_2',
    assetComponent: 'GeneralStore',
    cancelLegacyOffset: [-22, 0, 5],
    localYawToPlusZ: Math.PI / 2,
    scale: [1.4, 1.15, 0.98],
    colliderStyle: 'solid_box',
  },
  bldg_shop_3: {
    blueprintId: 'bldg_shop_3',
    assetComponent: 'GeneralStore',
    cancelLegacyOffset: [-22, 0, 5],
    localYawToPlusZ: Math.PI / 2,
    scale: [1.4, 1.15, 0.98],
    colliderStyle: 'solid_box',
  },
  bldg_library: {
    blueprintId: 'bldg_library',
    assetComponent: 'RecordsLibrary',
    cancelLegacyOffset: [-23.1, 0, 30],
    localYawToPlusZ: 0,
    scale: [3.2, 2.0, 2.8],
    colliderStyle: 'solid_box',
  },
  // Step 3 — Modular North District Procedural Architecture
  bldg_insula_1: {
    blueprintId: 'bldg_insula_1',
    assetComponent: 'ModularInsula',
    cancelLegacyOffset: [0, 0, 0],
    localYawToPlusZ: 0,
    scale: [1, 1, 1],
    colliderStyle: 'solid_box',
  },
  bldg_insula_2: {
    blueprintId: 'bldg_insula_2',
    assetComponent: 'ModularInsula',
    cancelLegacyOffset: [0, 0, 0],
    localYawToPlusZ: 0,
    scale: [1, 1, 1],
    colliderStyle: 'solid_box',
  },
  bldg_insula_3: {
    blueprintId: 'bldg_insula_3',
    assetComponent: 'ModularInsula',
    cancelLegacyOffset: [0, 0, 0],
    localYawToPlusZ: 0,
    scale: [1, 1, 1],
    colliderStyle: 'solid_box',
  },
  bldg_insula_4: {
    blueprintId: 'bldg_insula_4',
    assetComponent: 'ModularInsula',
    cancelLegacyOffset: [0, 0, 0],
    localYawToPlusZ: 0,
    scale: [1, 1, 1],
    colliderStyle: 'solid_box',
  },
  bldg_insula_5: {
    blueprintId: 'bldg_insula_5',
    assetComponent: 'ModularInsula',
    cancelLegacyOffset: [0, 0, 0],
    localYawToPlusZ: 0,
    scale: [1, 1, 1],
    colliderStyle: 'solid_box',
  },
  bldg_insula_6: {
    blueprintId: 'bldg_insula_6',
    assetComponent: 'ModularInsula',
    cancelLegacyOffset: [0, 0, 0],
    localYawToPlusZ: 0,
    scale: [1, 1, 1],
    colliderStyle: 'solid_box',
  },
  bldg_well_courtyard: {
    blueprintId: 'bldg_well_courtyard',
    assetComponent: 'CommunalWellCourtyard',
    cancelLegacyOffset: [0, 0, 0],
    localYawToPlusZ: 0,
    scale: [1, 1, 1],
    colliderStyle: 'well_courtyard',
  },
  bldg_temple_fortuna: {
    blueprintId: 'bldg_temple_fortuna',
    assetComponent: 'TempleOfFortuna',
    cancelLegacyOffset: [0, 0, 0],
    localYawToPlusZ: 0,
    scale: [1, 1, 1],
    colliderStyle: 'solid_box',
  },
  bldg_watch_barracks: {
    blueprintId: 'bldg_watch_barracks',
    assetComponent: 'WatchBarracksCompound',
    cancelLegacyOffset: [0, 0, 0],
    localYawToPlusZ: 0,
    scale: [1, 1, 1],
    colliderStyle: 'barracks_courtyard',
  },
  bldg_domus_1: {
    blueprintId: 'bldg_domus_1',
    assetComponent: 'PatricianDomusVilla',
    cancelLegacyOffset: [0, 0, 0],
    localYawToPlusZ: 0,
    scale: [1, 1, 1],
    colliderStyle: 'solid_box',
  },
  bldg_domus_2: {
    blueprintId: 'bldg_domus_2',
    assetComponent: 'PatricianDomusVilla',
    cancelLegacyOffset: [0, 0, 0],
    localYawToPlusZ: 0,
    scale: [1, 1, 1],
    colliderStyle: 'solid_box',
  },
  bldg_domus_3: {
    blueprintId: 'bldg_domus_3',
    assetComponent: 'PatricianDomusVilla',
    cancelLegacyOffset: [0, 0, 0],
    localYawToPlusZ: 0,
    scale: [1, 1, 1],
    colliderStyle: 'solid_box',
  },
  bldg_domus_4: {
    blueprintId: 'bldg_domus_4',
    assetComponent: 'PatricianDomusVilla',
    cancelLegacyOffset: [0, 0, 0],
    localYawToPlusZ: 0,
    scale: [1, 1, 1],
    colliderStyle: 'solid_box',
  },
};

/**
 * Step 2 — Perimeter City Walls, Gatehouses & Corner Bastions at ±200.
 * North wall integrates directly into NorthernMotte flanks at x = ±36, z = -200.
 */
export const PERIMETER_WALL_BOUND = 200;
export const PERIMETER_WALL_THICKNESS = 3.2;
export const PERIMETER_WALL_HEIGHT = 8.6;
export const PERIMETER_BASTION_HALF = 5.5;
export const PERIMETER_GATE_CLEAR_HALF = 6.4; // Clears 12-unit road width
export const PERIMETER_GATE_TOWER_OUTER_HALF = 12.0; // Total gatehouse span = 24
export const PERIMETER_CITADEL_JOIN_X = 36; // Docks directly into scaled Motte & Moat flanks

export interface BlueprintGatehouse {
  id: string;
  name: string;
  roadId: string;
  position: [number, number, number];
  rotationY: number;
}

export interface BlueprintCornerBastion {
  id: string;
  name: string;
  position: [number, number, number];
  rotationY: number;
}

export interface BlueprintWallSegment {
  id: string;
  side: 'north' | 'south' | 'west' | 'east';
  start: [number, number];
  end: [number, number];
}

export const BLUEPRINT_GATEHOUSES: BlueprintGatehouse[] = [
  {
    id: 'gate_south',
    name: 'Porta Appia (South Gate)',
    roadId: 'road_main_south',
    position: [0, 0, PERIMETER_WALL_BOUND],
    rotationY: 0,
  },
  {
    id: 'gate_west',
    name: 'Porta Mercatoria (West Gate)',
    roadId: 'road_main_west',
    position: [-PERIMETER_WALL_BOUND, 0, 0],
    rotationY: -Math.PI / 2,
  },
  {
    id: 'gate_east',
    name: 'Porta Scholaris (East Gate)',
    roadId: 'road_main_east',
    position: [PERIMETER_WALL_BOUND, 0, 0],
    rotationY: Math.PI / 2,
  },
];

export const BLUEPRINT_CORNER_BASTIONS: BlueprintCornerBastion[] = [
  {
    id: 'bastion_nw',
    name: 'North-West Bastion',
    position: [-PERIMETER_WALL_BOUND, 0, -PERIMETER_WALL_BOUND],
    rotationY: Math.PI / 4,
  },
  {
    id: 'bastion_ne',
    name: 'North-East Bastion',
    position: [PERIMETER_WALL_BOUND, 0, -PERIMETER_WALL_BOUND],
    rotationY: -Math.PI / 4,
  },
  {
    id: 'bastion_sw',
    name: 'South-West Bastion',
    position: [-PERIMETER_WALL_BOUND, 0, PERIMETER_WALL_BOUND],
    rotationY: (3 * Math.PI) / 4,
  },
  {
    id: 'bastion_se',
    name: 'South-East Bastion',
    position: [PERIMETER_WALL_BOUND, 0, PERIMETER_WALL_BOUND],
    rotationY: -(3 * Math.PI) / 4,
  },
];

export const BLUEPRINT_WALL_SEGMENTS: BlueprintWallSegment[] = [
  // North curtain anchored directly into Citadel flanks at x = ±36
  {
    id: 'wall_north_west',
    side: 'north',
    start: [-PERIMETER_WALL_BOUND + PERIMETER_BASTION_HALF, -PERIMETER_WALL_BOUND],
    end: [-PERIMETER_CITADEL_JOIN_X, -PERIMETER_WALL_BOUND],
  },
  {
    id: 'wall_north_east',
    side: 'north',
    start: [PERIMETER_CITADEL_JOIN_X, -PERIMETER_WALL_BOUND],
    end: [PERIMETER_WALL_BOUND - PERIMETER_BASTION_HALF, -PERIMETER_WALL_BOUND],
  },
  // South curtain flanking Porta Appia
  {
    id: 'wall_south_west',
    side: 'south',
    start: [-PERIMETER_WALL_BOUND + PERIMETER_BASTION_HALF, PERIMETER_WALL_BOUND],
    end: [-PERIMETER_GATE_TOWER_OUTER_HALF, PERIMETER_WALL_BOUND],
  },
  {
    id: 'wall_south_east',
    side: 'south',
    start: [PERIMETER_GATE_TOWER_OUTER_HALF, PERIMETER_WALL_BOUND],
    end: [PERIMETER_WALL_BOUND - PERIMETER_BASTION_HALF, PERIMETER_WALL_BOUND],
  },
  // West curtain flanking Porta Mercatoria
  {
    id: 'wall_west_north',
    side: 'west',
    start: [-PERIMETER_WALL_BOUND, -PERIMETER_WALL_BOUND + PERIMETER_BASTION_HALF],
    end: [-PERIMETER_WALL_BOUND, -PERIMETER_GATE_TOWER_OUTER_HALF],
  },
  {
    id: 'wall_west_south',
    side: 'west',
    start: [-PERIMETER_WALL_BOUND, PERIMETER_GATE_TOWER_OUTER_HALF],
    end: [-PERIMETER_WALL_BOUND, PERIMETER_WALL_BOUND - PERIMETER_BASTION_HALF],
  },
  // East curtain flanking Porta Scholaris
  {
    id: 'wall_east_north',
    side: 'east',
    start: [PERIMETER_WALL_BOUND, -PERIMETER_WALL_BOUND + PERIMETER_BASTION_HALF],
    end: [PERIMETER_WALL_BOUND, -PERIMETER_GATE_TOWER_OUTER_HALF],
  },
  {
    id: 'wall_east_south',
    side: 'east',
    start: [PERIMETER_WALL_BOUND, PERIMETER_GATE_TOWER_OUTER_HALF],
    end: [PERIMETER_WALL_BOUND, PERIMETER_WALL_BOUND - PERIMETER_BASTION_HALF],
  },
];

export interface BlueprintCheckpoint {
  id: string;
  label: string;
  position: [number, number, number];
  rotationY: number;
}

/** Quick-check teleport spots tailored for verifying city districts & perimeter walls. */
export const BLUEPRINT_CHECKPOINTS: BlueprintCheckpoint[] = [
  {
    id: 'central_plaza',
    label: 'Central Plaza',
    position: [0, 0, 14],
    rotationY: Math.PI,
  },
  {
    id: 'colosseum_front',
    label: 'Colosseum Gate',
    position: [0, 0, 76],
    rotationY: -Math.PI / 2,
  },
  {
    id: 'castle_ramp_foot',
    label: 'Castle Ramp (Y=0)',
    position: [0, 0, -126],
    rotationY: Math.PI,
  },
  {
    id: 'castle_summit',
    label: 'Castle Summit (Y=8)',
    position: [0, CITADEL_SUMMIT_Y, -166],
    rotationY: Math.PI,
  },
  {
    id: 'market_square',
    label: 'Market Artery',
    position: [-50, 0, 0],
    rotationY: -Math.PI / 2,
  },
  {
    id: 'circus_ave',
    label: 'Circus Maximus',
    position: [110, 0, 40],
    rotationY: 0,
  },
  {
    id: 'south_gate',
    label: 'South Gatehouse',
    position: [0, 0, 186],
    rotationY: 0,
  },
  {
    id: 'west_gate',
    label: 'West Gatehouse',
    position: [-186, 0, 0],
    rotationY: -Math.PI / 2,
  },
  {
    id: 'east_gate',
    label: 'East Gatehouse',
    position: [186, 0, 0],
    rotationY: Math.PI / 2,
  },
  {
    id: 'north_citadel_wall',
    label: 'Citadel Wall Link',
    position: [-48, 0, -184],
    rotationY: Math.PI,
  },
  {
    id: 'temple_fortuna',
    label: 'Temple of Fortuna',
    position: [80, 0, -60],
    rotationY: -Math.PI / 2,
  },
  {
    id: 'watch_barracks',
    label: 'Watch Barracks',
    position: [104, 0, -60],
    rotationY: Math.PI,
  },
  {
    id: 'north_slums',
    label: 'North Slums / Insulae',
    position: [-100, 0, -55],
    rotationY: -Math.PI * 0.75,
  },
  {
    id: 'patrician_villas',
    label: 'Patrician Villas',
    position: [145, 0, -60],
    rotationY: Math.PI,
  },
];
