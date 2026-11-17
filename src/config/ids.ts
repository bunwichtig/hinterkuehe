/**
 * Feste Kennungen von Hinterkühe.
 *
 * Diese Werte trennen das Spiel von anderen Spielen auf derselben Domain
 * (bunwichtig.github.io) und von älteren Versionen. Beim Wechsel auf eine
 * inkompatible Protokollversion PEER_PREFIX hochzählen (v1 → v2).
 */
export const APP_NAME = 'Hinterkühe';

/** PeerJS-Kennung des Hosts = PEER_PREFIX + Raum-Slug. */
export const PEER_PREFIX = 'hinterkuehe-v1-';

/** Salz für den Passwort-Hash: SHA-256(HASH_SALT + raum + '|' + passwort). */
export const HASH_SALT = 'hinterkuehe|';

/** Präfix für alle localStorage-Schlüssel. */
export const STORAGE_PREFIX = 'hk-';

/** Präfix für BroadcastChannel beim lokalen Testen mit ?local. */
export const CHANNEL_PREFIX = 'hk-';

/** Spielversion (Schema 1.x.y wie in der Technik-Vorlage, vor 1.0 noch 0.x). */
export const VERSION = '0.3.0';
