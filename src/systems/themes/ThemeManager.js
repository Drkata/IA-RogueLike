import { EnchantedForestTheme } from './EnchantedForestTheme.js';
import { MedievalCityTheme } from './MedievalCityTheme.js';
import { DeepCaveTheme } from './DeepCaveTheme.js';
import { DemonicBaseTheme } from './DemonicBaseTheme.js';

export class ThemeManager {
    constructor() {
        this.themes = [
            EnchantedForestTheme,
            MedievalCityTheme,
            DeepCaveTheme,
            DemonicBaseTheme
        ];
    }

    getTheme(levelIndex) {
        // Change theme every 5 levels
        const themeIndex = Math.floor((levelIndex - 1) / 5) % this.themes.length;
        return this.themes[themeIndex];
    }

    getThemeName(levelIndex) {
        return this.getTheme(levelIndex).name;
    }

    getWallColors(levelIndex) {
        return this.getTheme(levelIndex).wallColors;
    }

    getFloorColor(levelIndex) {
        return this.getTheme(levelIndex).floorColor;
    }

    getCeilingColor(levelIndex) {
        return this.getTheme(levelIndex).ceilingColor;
    }

    getAmbientLight(levelIndex) {
        return this.getTheme(levelIndex).ambientLight;
    }

    getPointLightColor(levelIndex) {
        return this.getTheme(levelIndex).pointLightColor;
    }

    getDecorations(levelIndex) {
        return this.getTheme(levelIndex).decorations;
    }

    /**
     * Spawn decorations for a room based on theme
     * @param {Object} room - Room object {x, z, w, h}
     * @param {Object} startPos - Player start position to avoid
     * @param {number} levelIndex - Current level
     * @returns {Array} Array of decoration data {position, decoration}
     */
    generateRoomDecorations(room, startPos, levelIndex) {
        const theme = this.getTheme(levelIndex);
        const decorations = [];

        theme.decorations.forEach(decoType => {
            // Check spawn chance
            if (Math.random() > decoType.spawnChance) return;

            // Determine count
            const count = Math.floor(
                Math.random() * (decoType.maxPerRoom - decoType.minPerRoom + 1)
            ) + decoType.minPerRoom;

            for (let i = 0; i < count; i++) {
                let x, z;

                if (decoType.cornerOnly) {
                    // Place in corners
                    const corners = [
                        { x: room.x, z: room.z },
                        { x: room.x + room.w - 1, z: room.z },
                        { x: room.x, z: room.z + room.h - 1 },
                        { x: room.x + room.w - 1, z: room.z + room.h - 1 }
                    ];
                    const corner = corners[Math.floor(Math.random() * corners.length)];
                    x = corner.x;
                    z = corner.z;
                } else if (decoType.wallOnly) {
                    // Place along walls
                    const side = Math.floor(Math.random() * 4);
                    if (side === 0) { // Top
                        x = Math.floor(Math.random() * (room.w - 2)) + 1 + room.x;
                        z = room.z;
                    } else if (side === 1) { // Bottom
                        x = Math.floor(Math.random() * (room.w - 2)) + 1 + room.x;
                        z = room.z + room.h - 1;
                    } else if (side === 2) { // Left
                        x = room.x;
                        z = Math.floor(Math.random() * (room.h - 2)) + 1 + room.z;
                    } else { // Right
                        x = room.x + room.w - 1;
                        z = Math.floor(Math.random() * (room.h - 2)) + 1 + room.z;
                    }
                } else {
                    // Place randomly in room (avoid edges)
                    x = Math.floor(Math.random() * (room.w - 2)) + 1 + room.x;
                    z = Math.floor(Math.random() * (room.h - 2)) + 1 + room.z;
                }

                // Skip if on player start
                if (x === startPos.x && z === startPos.z) continue;

                decorations.push({
                    position: { x, z },
                    decoration: decoType
                });
            }
        });

        return decorations;
    }
}
