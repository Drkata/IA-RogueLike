// Values are calibrated: see ART_DIRECTION.md (« Lumière ») before changing them.
export const DeepCaveTheme = {
    name: 'Deep Cave',
    biome: 'cave', // Layered rock veined with glowing crystal
    lighting: {
        sky: 0x8a90c8,
        ground: 0x404058,
        fill: 7.5,
        sun: 0xa8b8ff, // Cold light from crystal clusters above
        sunIntensity: 5.0,
        sunDirection: [0.5, 0.7, 0.3],
        point: 0x8fb0ff, // Crystal glow
        pointIntensity: 24
    },
    fogColor: 0x0d0e18,
    fogDensity: 0.028,
    accent: 0x8fb0ff,
    foliage: 0x3a3a5a // Dead roots
};
