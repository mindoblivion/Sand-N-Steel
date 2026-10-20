/**
 * START-1 — the boot shell hand-off.
 *
 * `index.html` paints a boot shell (#boot-shell) before any bundle or stylesheet has
 * loaded: the manifest's `background_color` field with the title backdrop over it, so
 * the first frame, the installed-app splash and the title screen are the same picture.
 * Once React has mounted there is nothing left for it to cover, so it fades out and is
 * removed.
 *
 * The fade is what makes the hand-off invisible: the title screen's own backdrop is the
 * same `.title-backdrop` rule, so the 300 ms dissolve never reveals a white or blank
 * frame — only the title screen's own controls settling in over the identical art.
 */

/** The inline boot shell's element id, as written in `index.html`. */
export const BOOT_SHELL_ID = 'boot-shell';

/** The class `index.html` fades the shell out with. */
export const BOOT_SHELL_OUT_CLASS = 'boot-shell-out';

/** Must match the `.title-backdrop` / `#boot-shell` transition in `index.html`. */
const BOOT_SHELL_FADE_MS = 300;

/**
 * Fade the boot shell out and remove it. Safe to call more than once, and safe in a
 * non-browser environment: a missing shell or a second call is a no-op, so no caller
 * ever has to check whether the shell is still there.
 */
export function dismissBootShell(): void {
  if (typeof document === 'undefined') return;

  const shell = document.getElementById(BOOT_SHELL_ID);
  if (!shell) return;
  if (shell.classList.contains(BOOT_SHELL_OUT_CLASS)) return;

  shell.classList.add(BOOT_SHELL_OUT_CLASS);
  window.setTimeout(() => shell.remove(), BOOT_SHELL_FADE_MS);
}
