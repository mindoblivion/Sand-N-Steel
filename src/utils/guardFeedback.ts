/**
 * C-8.84D / C-8.84F — the words a raised guard is reported with, chosen by
 * whether the fighter actually carries a shield.
 *
 * The `shield_block` stance is shared by every loadout: a `dual_blades`, spear
 * or mace fighter can brace, and C-8.84B's zero-cost fallback sends an
 * unaffordable Dodge there. The stance, its cost and its `isBlocking` flag were
 * always correct; only the copy assumed a board on every fighter.
 *
 * C-8.84D fixed the turn-action site (`shieldGuardFeedback`). The C-8.84E audit
 * then found the SAME defect at two further sites, closed here as C-8.84F:
 *
 *   • `reactionGuardFeedback` — the player's reaction guard on an announced
 *     strike, which logged "snaps the shield up!" for every loadout.
 *   • `blockedStrikeLog` — the resolution line for a strike a guard stopped,
 *     which credited "the defender's shield" whether or not one was carried.
 *
 * What this module owns — the WORDING, nothing else:
 *
 *   • `weaponCarriesShield` — whether the fighter's loadout actually carries a
 *     board. It reads the same rule the rendered mesh (`GladiatorMesh`) uses to
 *     decide whether to attach the scutum, so the chronicle and the 3D scene
 *     cannot disagree about whether a shield is on the fighter. It is the ONE
 *     detector: all three feedback call sites ask this function.
 *   • the three copy builders below — each returns the shipped shield-equipped
 *     wording byte for byte, and neutral guard wording for a shield-less
 *     fighter.
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
 * The copy for a guard raised on the fighter's own turn (`shield_block`).
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

/**
 * C-8.84F — the copy for the player's guard REACTION to an announced strike.
 *
 * The cue is `GUARD!` for both loadouts (the shipped cue, unchanged): only the
 * chronicle line ever named a shield.
 *
 * @param name          the player answering the announcement
 * @param carriesShield `weaponCarriesShield(player.loadout.weapon)`
 */
export function reactionGuardFeedback(name: string, carriesShield: boolean): ShieldGuardFeedback {
  return carriesShield
    ? { log: `${name} snaps the shield up!`, cue: 'GUARD!' }
    : { log: `${name} sets a tight guard.`, cue: 'GUARD!' };
}

/**
 * C-8.84F — the chronicle line for a strike a defence stopped.
 *
 * The shield-equipped wording is the shipped line, unchanged; a shield-less
 * defender's guard is named as a guard instead.
 *
 * @param attackerName  the fighter whose strike was stopped
 * @param defenderName  the fighter holding the guard
 * @param carriesShield `weaponCarriesShield(defender.loadout.weapon)`
 * @param damage        the damage that got through, as reported before
 */
export function blockedStrikeLog(
  attackerName: string,
  defenderName: string,
  carriesShield: boolean,
  damage: number,
): string {
  const stoppedBy = carriesShield ? `${defenderName}'s shield` : `${defenderName}'s guard`;
  return `${attackerName}'s strike was BLOCKED by ${stoppedBy} (-${damage} HP)!`;
}
