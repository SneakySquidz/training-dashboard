// Private mode: a device sees health data only after it has been given the key once.
// Guest (no key on this device): Home hides its health blocks (.priv) and health pages redirect to Home.
// The key arrives by an unlock link, <site>#unlock=<key>, and is kept in localStorage only if it decrypts the bundle.
// This is a view filter on top of the encryption: without the key the health bundle can't be read anyway.

export const HEALTH_TABS = ['readiness', 'body', 'nutrition', 'tips'];

/** The tab to render: a guest asking for a health page gets Home. */
export const routeFor = (tab, guest) => (guest && HEALTH_TABS.includes(tab) ? 'home' : tab);

/** The key in an unlock link's hash (#unlock=<key>), or null if the hash isn't one. */
export function unlockKeyFrom(hash) {
  const m = /^#?unlock=(.+)$/.exec(hash || '');
  if (!m) return null;
  try { return decodeURIComponent(m[1]) || null; } catch { return null; }
}

/** The unlock link for another device of the owner. */
export const unlockLink = (base, key) => `${base}#unlock=${encodeURIComponent(key)}`;

/**
 * Tries a key on the encrypted bundle. Saves it (save(key)) only when decryption works.
 * Returns the decrypted health data, or null for a wrong key, a damaged file or no bundle.
 */
export async function tryKey(enc, key, { decrypt, save }) {
  if (!enc || !key) return null;
  let health;
  try { health = await decrypt(enc, key); } catch { return null; }
  save(key);
  return health;
}
