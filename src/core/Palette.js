// The game palette, one colour per meaning (see ART_DIRECTION.md).
// Mirrored by the CSS tokens at the top of src/ui/hud.css: change both together.
export const PALETTE = {
    ink: 0x17121f, // Panels, dark backgrounds
    vellum: 0xece3cc, // Neutral text and highlights
    gilt: 0xc8a24e, // Gold, ranks, treasure
    giltBright: 0xe6c983,
    ember: 0xc93d27, // Life, danger, enemies, fire
    emberBright: 0xff7a52,
    aether: 0x3fae9f, // Mana, the player's magic, boons
    aetherBright: 0x9ef0e2,
    hex: 0x8250c9, // Chaos, critical hits, elites, the arcane
    hexBright: 0xc9a6ff,
    sage: 0x8fcf9a // Healing, full health
};

// CSS colour string of a palette entry, for canvas text
export const css = (color) => '#' + color.toString(16).padStart(6, '0');
