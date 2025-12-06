import { CONSTANTS } from '../core/Constants.js';

export class MapGenerator {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = [];
    }

    generate() {
        // Initialize with walls (1)
        this.data = new Array(this.width * this.height).fill(1);

        const rooms = [];
        const minRoomSize = 5; // Was 3
        const maxRoomSize = 12; // Was 8
        const maxRooms = 15;

        for (let i = 0; i < maxRooms; i++) {
            const w = Math.floor(Math.random() * (maxRoomSize - minRoomSize + 1)) + minRoomSize;
            const h = Math.floor(Math.random() * (maxRoomSize - minRoomSize + 1)) + minRoomSize;
            let x, z;

            if (rooms.length === 0) {
                // Force corner for first room (Safe Room)
                const corners = [
                    { x: 2, z: 2 }, // Top-Left
                    { x: this.width - w - 3, z: 2 }, // Top-Right
                    { x: 2, z: this.height - h - 3 }, // Bottom-Left
                    { x: this.width - w - 3, z: this.height - h - 3 } // Bottom-Right
                ];
                const corner = corners[Math.floor(Math.random() * corners.length)];
                x = corner.x;
                z = corner.z;
            } else {
                x = Math.floor(Math.random() * (this.width - w - 2)) + 1;
                z = Math.floor(Math.random() * (this.height - h - 2)) + 1;
            }

            const newRoom = { x, z, w, h };

            // Check overlap
            let failed = false;
            for (const other of rooms) {
                if (this.intersects(newRoom, other)) {
                    failed = true;
                    break;
                }
            }

            if (!failed) {
                this.createRoom(newRoom);

                if (rooms.length > 0) {
                    const prevRoom = rooms[rooms.length - 1];
                    const newCenter = this.getCenter(newRoom);
                    const prevCenter = this.getCenter(prevRoom);

                    // Randomly choose horizontal then vertical OR vertical then horizontal
                    if (Math.random() > 0.5) {
                        this.createHCorridor(prevCenter.x, newCenter.x, prevCenter.z);
                        this.createVCorridor(prevCenter.z, newCenter.z, newCenter.x);
                    } else {
                        this.createVCorridor(prevCenter.z, newCenter.z, prevCenter.x);
                        this.createHCorridor(prevCenter.x, newCenter.x, newCenter.z);
                    }
                }

                rooms.push(newRoom);
            }
        }

        // Ensure player start is in the first room
        const startRoom = rooms[0];
        const playerStart = {
            x: Math.floor(startRoom.x + startRoom.w / 2),
            z: Math.floor(startRoom.z + startRoom.h / 2)
        };

        return {
            width: this.width,
            height: this.height,
            data: this.data,
            playerStart: playerStart,
            cellSize: CONSTANTS.CELL_SIZE,
            rooms: rooms, // Export rooms for decoration
            safeRoom: rooms[0] // First room is always safe
        };
    }

    createRoom(room) {
        for (let y = room.z; y < room.z + room.h; y++) {
            for (let x = room.x; x < room.x + room.w; x++) {
                this.data[y * this.width + x] = 0; // Floor
            }
        }
    }

    createHCorridor(x1, x2, z) {
        const start = Math.min(x1, x2);
        const end = Math.max(x1, x2);
        for (let x = start; x <= end; x++) {
            this.data[z * this.width + x] = 0;
            // Widen to 7 units (Center + 3 on each side)
            if (z > 1) this.data[(z - 1) * this.width + x] = 0;
            if (z > 2) this.data[(z - 2) * this.width + x] = 0;
            if (z > 3) this.data[(z - 3) * this.width + x] = 0; // +1
            if (z < this.height - 2) this.data[(z + 1) * this.width + x] = 0;
            if (z < this.height - 3) this.data[(z + 2) * this.width + x] = 0;
            if (z < this.height - 4) this.data[(z + 3) * this.width + x] = 0; // +1
        }
    }

    createVCorridor(z1, z2, x) {
        const start = Math.min(z1, z2);
        const end = Math.max(z1, z2);
        for (let z = start; z <= end; z++) {
            this.data[z * this.width + x] = 0;
            // Widen to 7 units (Center + 3 on each side)
            if (x > 1) this.data[z * this.width + (x - 1)] = 0;
            if (x > 2) this.data[z * this.width + (x - 2)] = 0;
            if (x > 3) this.data[z * this.width + (x - 3)] = 0; // +1
            if (x < this.width - 2) this.data[z * this.width + (x + 1)] = 0;
            if (x < this.width - 3) this.data[z * this.width + (x + 2)] = 0;
            if (x < this.width - 4) this.data[z * this.width + (x + 3)] = 0; // +1
        }
    }

    getCenter(room) {
        return {
            x: Math.floor(room.x + room.w / 2),
            z: Math.floor(room.z + room.h / 2)
        };
    }

    intersects(room1, room2) {
        return (
            room1.x <= room2.x + room2.w &&
            room1.x + room1.w >= room2.x &&
            room1.z <= room2.z + room2.h &&
            room1.z + room1.h >= room2.z
        );
    }

    generateArena() {
        // Initialize with walls (1)
        this.data = new Array(this.width * this.height).fill(1);

        // Create one massive room
        const margin = 5;
        const room = {
            x: margin,
            z: margin,
            w: this.width - (margin * 2),
            h: this.height - (margin * 2)
        };

        this.createRoom(room);

        // Pillars removed per user request (Hard Mode)
        /*
        const pillarSize = 3;
        const cx = Math.floor(this.width / 2);
        const cz = Math.floor(this.height / 2);
        const offset = 10;

        const pillars = [
            { x: cx - offset, z: cz - offset },
            { x: cx + offset, z: cz - offset },
            { x: cx - offset, z: cz + offset },
            { x: cx + offset, z: cz + offset }
        ];

        for (const p of pillars) {
            for (let z = p.z; z < p.z + pillarSize; z++) {
                for (let x = p.x; x < p.x + pillarSize; x++) {
                    this.data[z * this.width + x] = 1; // Wall
                }
            }
        }
        */
        const cx = Math.floor(this.width / 2);
        const cz = Math.floor(this.height / 2);
        const offset = 10;

        const playerStart = {
            x: cx,
            z: cz - offset - 5 // Start away from center
        };

        return {
            width: this.width,
            height: this.height,
            data: this.data,
            playerStart: playerStart,
            cellSize: CONSTANTS.CELL_SIZE,
            rooms: [room],
            safeRoom: room,
            isArena: true,
            bossSpawn: { x: cx, z: cz } // Center
        };
    }
}
