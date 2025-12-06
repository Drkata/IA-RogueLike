export const CONSTANTS = {
    FOV: 75,
    PLAYER_SPEED: 10,
    PLAYER_SENSITIVITY: 0.002,
    GRAVITY: 30,
    JUMP_FORCE: 12,
    WALL_HEIGHT: 3,
    CELL_SIZE: 2,
    DIFFICULTY: {
        // Enemy Count
        ENEMY_COUNT_BASE: 5,
        ENEMY_COUNT_PER_LEVEL: 2,
        ENEMY_COUNT_SCALING_POST_10: 2, // Extra enemies per level after 10

        // Enemy Stats
        ENEMY_HEALTH_BASE: 10,
        ENEMY_HEALTH_PER_LEVEL: 5,
        ENEMY_HEALTH_MULTIPLIER_POST_10: 0.15, // +15% compounding per level > 10

        ENEMY_DAMAGE_BASE: 5,
        ENEMY_DAMAGE_PER_LEVEL: 1.125,
        ENEMY_DAMAGE_MULTIPLIER_POST_10: 0.10, // +10% compounding per level > 10

        ENEMY_SPEED_BASE: 4.0,
        ENEMY_SPEED_PER_LEVEL: 0.2,
        ENEMY_SPEED_CAP: 10.0, // Increased cap (was 8.0)

        // Mechanics Unlock Levels
        MECHANIC_REGEN_LEVEL: 12,
        MECHANIC_SHIELD_LEVEL: 15,

        // Mechanics Stats
        REGEN_RATE: 0.05, // 5% max health per second
        REGEN_DELAY: 3.0, // Seconds without damage to start regen
        SHIELD_HITS: 1,   // Hits blocked
        SHIELD_REGEN_DELAY: 5.0, // Seconds without damage to regen shield
        SHIELD_REGEN_RATE: 1 // Hits restored per regen tick (usually full restore or 1)
    }
};
