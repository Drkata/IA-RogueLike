import { CONSTANTS } from '../core/Constants.js';

export class Minimap {
    constructor(levelManager, player, canvasId) {
        this.levelManager = levelManager;
        this.player = player;
        this.canvas = document.createElement('canvas');
        this.canvas.width = 200;
        this.canvas.height = 200;
        this.ctx = this.canvas.getContext('2d');

        this.size = 200; // Canvas size in pixels
        this.scale = 1;
    }

    update(enemies = []) {
        if (!this.levelManager.levelData) return;

        const mapWidth = this.levelManager.width;
        const mapHeight = this.levelManager.height;

        // Calculate scale to fit map in canvas
        const scaleX = this.size / mapWidth;
        const scaleY = this.size / mapHeight;
        this.scale = Math.min(scaleX, scaleY);

        // Player grid position
        const playerGridPos = {
            x: this.player.position.x / CONSTANTS.CELL_SIZE,
            z: this.player.position.z / CONSTANTS.CELL_SIZE
        };




        // Clear canvas
        this.ctx.clearRect(0, 0, this.size, this.size);
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(0, 0, this.size, this.size);

        // ----- Draw rotating map -----
        this.ctx.save();
        // Translate to centre (player will be drawn at centre after restore)
        const cx = this.size / 2;
        const cz = this.size / 2;
        this.ctx.translate(cx, cz);
        // Rotate opposite to player yaw so that forward is always up
        this.ctx.rotate(-this.player.yaw);

        // Draw map cells relative to player
        for (let y = 0; y < mapHeight; y++) {
            for (let x = 0; x < mapWidth; x++) {
                const index = y * mapWidth + x;
                const isWall = this.levelManager.data[index] === 1;
                if (isWall) {
                    const offsetX = (x - playerGridPos.x) * this.scale;
                    const offsetZ = (y - playerGridPos.z) * this.scale;
                    this.ctx.fillStyle = '#555';
                    this.ctx.fillRect(offsetX, offsetZ, this.scale, this.scale);
                }
            }
        }

        // Draw enemies relative to player
        for (const enemy of enemies) {
            if (enemy.isDead) continue;
            const enemyGridPos = {
                x: enemy.position.x / CONSTANTS.CELL_SIZE,
                z: enemy.position.z / CONSTANTS.CELL_SIZE
            };
            const offsetX = (enemyGridPos.x - playerGridPos.x) * this.scale;
            const offsetZ = (enemyGridPos.z - playerGridPos.z) * this.scale;
            this.ctx.fillStyle = 'orange';
            this.ctx.beginPath();
            this.ctx.arc(offsetX, offsetZ, this.scale * 1.2, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Restore to original orientation – player will be drawn on top of the rotated map
        this.ctx.restore();

        // ----- Draw fixed player marker at centre -----
        const playerScreenX = this.size / 2;
        const playerScreenZ = this.size / 2;
        this.ctx.fillStyle = 'red';
        this.ctx.beginPath();
        this.ctx.arc(playerScreenX, playerScreenZ, this.scale * 1.5, 0, Math.PI * 2);
        this.ctx.fill();

        // Draw player direction arrow pointing up (static)
        const dirX = Math.sin(this.player.yaw);
        const dirZ = Math.cos(this.player.yaw);
        this.ctx.strokeStyle = 'red';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(playerScreenX, playerScreenZ);
        // Invert X component to correct left/right inversion
        this.ctx.lineTo(
            playerScreenX - dirX * this.scale * 2,
            playerScreenZ - dirZ * this.scale * 2
        );
        this.ctx.stroke();
    }
}
