/**
 * C-8.84D — the chronicle line and floating cue for a fighter who takes the
 * `shield_block` turn action.
 *
 * The branch fired for every fighter, but its copy was written for one of them:
 * `"X braces behind their shield."` with a `BRACED!` cue. An opponent carrying
 * twin daggers (`dual_blades`), a spear or a mace has no shield at all, so the
 * zero-cost guard C-8.84B falls back to for an unaffordable Dodge told the
 * player it had raised a shield it does not own. The action, its zero cost and
 * its `isBlocking` stance were all correct; only the words were wrong.
 *
 * What this module owns — the WORDING, nothing else:
 *
 *   • `weaponCarriesShield` — whether the fighter's loadout actually carries a
 *     board. It reads the same rule the rendered mesh (`GladiatorMesh`) uses to
 *     decide whether to attach the scutum, so the chronicle and the 3D scene
 *     cannot disagree about whether a shield is on the fighter.
 *   • `shieldGuardFeedback` — the one log line plus its floating cue, chosen by
 *     that answer. A shield-less guard gets neutral copy that names the stance
 *     instead of equipment the fighter does not have.
 *
 * Deliberately NOT here: stamina, block mitigation, the stance flags, damage,
 * evade chance, AI action selection and turn timing. The shield-equipped copy is
 * unchanged, word for word, so nothing a player already knows has moved.
 *
 * Pure text and a pure boolean: no fighter state is mutated, no RNG is drawn.
 */

/** The fields of a weapon that decide whether a board is on the fighter. */
export interface ShieldBearingWeapon {
  type?: string;
  name?: string;
  id?: string;
}

/**
 * Does this loadout carry a shield?
 *
 * Mirrors `GladiatorMesh`'s own `hasShield` rule: the `sword_shield` type, a
 * weapon whose name or id names a shield, or no resolved weapon at all (the
 * mesh falls back to the default gladius-and-scutum rather than a bare hand).
 *
 * Keep this and `GladiatorMesh` in step: the chronicle must describe what the
 * scene shows.
 */
export function weaponCarriesShield(weapon?: ShieldBearingWeapon | null): boolean {
  if (!weapon) return true;
  if (weapon.type === 'sword_shield') return true;
  const name = weapon.name?.toLowerCase() ?? '';
  const id = weapon.id?.toLowerCase() ?? '';
  return name.includes('shield') || id.includes('shield');
}

/** The chronicle line and the floating cue for one raised guard. */
export interface ShieldGuardFeedback {
  log: string;
  cue: string;
}

/**
 * The copy for a raised guard, chosen by whether the fighter has a shield.
 *
 * @param name          the fighter raising the guard
 * @param carriesShield `weaponCarriesShield(fighter.loadout.weapon)`
 * @returns the chronicle line and the damage-text cue. The shield-equipped
 *          wording is the shipped copy, unchanged; the shield-less wording
 *          names the guard without claiming a shield.
 */
export function shieldGuardFeedback(name: string, carriesShield: boolean): ShieldGuardFeedback {
  return carriesShield
    ? { log: `${name} braces behind their shield.`, cue: 'BRACED!' }
    : { log: `${name} sets a tight guard.`, cue: 'GUARD!' };
}
