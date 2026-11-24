// Values are calibrated: see ART_DIRECTION.md (« Lumière ») before changing them.
export const EnchantedForestTheme = {
    name: 'Enchanted Forest',
    biome: 'forest', // Moss-eaten ruins under a moonlit night
    lighting: {
        sky: 0xa0b8d8, // Hemisphere light, from above
        ground: 0x3a4a32, // Hemisphere light, bounced from below
        fill: 4.4,
        sun: 0xc8dcff, // Moonlight
        sunIntensity: 6.0,
        sunDirection: [0.45, 0.75, 0.35],
        point: 0x7fffe0, // Will-o'-the-wisp room lights
        pointIntensity: 18
    },
    fogColor: 0x1c2a3c,
    fogDensity: 0.02,
    accent: 0x5fe0c8, // Glowing runes on the floating islands
    foliage: 0x2e6b3a
};
