import { CONSTANTS } from '../core/Constants.js';

export class MapGenerator {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = [];
        this.corridorCells = []; // Candidate cells for spike traps
    }

    generate() {
        // Initialize with walls (1)
        this.data = new Array(this.width * this.height).fill(1);
        this.corridorCells = [];

        const rooms = [];
        const minRoomSize = 6; // Slightly larger for better pillar generation
        const maxRoomSize = 13;
        const maxRooms = 15;

        // 1. Generate Room Dimensions and Positions
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
                rooms.push(newRoom);
            }
        }

        // 2. Assign Room Types
        for (let i = 0; i < rooms.length; i++) {
            if (i === 0) {
                rooms[i].type = 'safe';
            } else if (i === rooms.length - 1) {
                rooms[i].type = 'event';
            } else if (i === Math.floor(rooms.length / 2)) {
                rooms[i].type = 'treasure';
            } else {
                rooms[i].type = 'normal';
            }
        }

        // 3. Carve Rooms & Corridors
        rooms.forEach((room, idx) => {
            this.createRoom(room);

            if (idx > 0) {
                const prevRoom = rooms[idx - 1];
                const newCenter = this.getCenter(room);
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
        });

        // 4. Ensure player start is in the center of the Safe Room
        const startRoom = rooms[0];
        const playerStart = this.getCenter(startRoom);

        // 5. Select Spike Trap Positions from Corridors
        const spikeTraps = [];
        const minTrapDistFromStart = 8;
        const numTraps = 4 + Math.floor(rooms.length * 0.7);

        const candidateTrapCells = this.corridorCells.filter(c => {
            const dx = c.x - playerStart.x;
            const dz = c.z - playerStart.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            // Must be far from start and currently empty/floor in grid
            return dist > minTrapDistFromStart && this.data[c.z * this.width + c.x] === 0;
        });

        candidateTrapCells.sort(() => 0.5 - Math.random());
        for (let i = 0; i < Math.min(numTraps, candidateTrapCells.length); i++) {
            spikeTraps.push(candidateTrapCells[i]);
        }

        // 6. Select Magical Sentinel Positions in normal rooms
        const sentinels = [];
        rooms.forEach((room) => {
            if (room.type === 'normal' && Math.random() < 0.5) {
                // Place in one of the corners of the room
                const corners = [
                    { x: room.x, z: room.z },
                    { x: room.x + room.w - 1, z: room.z },
                    { x: room.x, z: room.z + room.h - 1 },
                    { x: room.x + room.w - 1, z: room.z + room.h - 1 }
                ];
                // Must be floor (0)
                const valid = corners.filter(c => this.data[c.z * this.width + c.x] === 0);
                if (valid.length > 0) {
                    sentinels.push(valid[Math.floor(Math.random() * valid.length)]);
                }
            }
        });

        // 7. Event Room setups (Altar or Fountain)
        const eventRoom = rooms.find(r => r.type === 'event') || rooms[rooms.length - 1];
        const eventSpawn = this.getCenter(eventRoom);
        const randEvent = Math.random();
        const eventType = randEvent < 0.4 ? 'altar' : (randEvent < 0.8 ? 'shop' : 'fountain');

        // 8. Treasure Room setups
        const treasureRoom = rooms.find(r => r.type === 'treasure') || rooms[Math.floor(rooms.length / 2)];
        const treasureSpawn = this.getCenter(treasureRoom);

        return {
            width: this.width,
            height: this.height,
            data: this.data,
            playerStart: playerStart,
            cellSize: CONSTANTS.CELL_SIZE,
            rooms: rooms,
            safeRoom: rooms[0],
            spikeTraps: spikeTraps,
            sentinels: sentinels,
            eventSpawn: eventSpawn,
            eventType: eventType,
            treasureSpawn: treasureSpawn
        };
    }

    createRoom(room) {
        if (room.type === 'event') {
            // Force event/altar rooms to be small 5x5 isolated chambers
            const carveW = 5;
            const carveH = 5;
            const startX = Math.floor(room.x + (room.w - carveW) / 2);
            const startZ = Math.floor(room.z + (room.h - carveH) / 2);
            room.x = startX;
            room.z = startZ;
            room.w = carveW;
            room.h = carveH;
        }

        // Carve floor
        for (let y = room.z; y < room.z + room.h; y++) {
            for (let x = room.x; x < room.x + room.w; x++) {
                this.data[y * this.width + x] = 0; // Floor
            }
        }

        // Add internal pillars to Normal rooms that are large enough
        if (room.type === 'normal' && room.w >= 7 && room.h >= 7) {
            const cx = Math.floor(room.x + room.w / 2);
            const cz = Math.floor(room.z + room.h / 2);
            const rand = Math.random();

            if (rand < 0.35) {
                // Central 2x2 pillar
                for (let dy = -1; dy <= 0; dy++) {
                    for (let dx = -1; dx <= 0; dx++) {
                        this.data[(cz + dy) * this.width + (cx + dx)] = 1; // Wall
                    }
                }
            } else if (rand < 0.7) {
                // 4 Small corner pillars
                const offset = 1;
                this.data[(room.z + offset) * this.width + (room.x + offset)] = 1;
                this.data[(room.z + room.h - 1 - offset) * this.width + (room.x + offset)] = 1;
                this.data[(room.z + offset) * this.width + (room.x + room.w - 1 - offset)] = 1;
                this.data[(room.z + room.h - 1 - offset) * this.width + (room.x + room.w - 1 - offset)] = 1;
            }
        }
    }

    createHCorridor(x1, x2, z) {
        const start = Math.min(x1, x2);
        const end = Math.max(x1, x2);
        for (let x = start; x <= end; x++) {
            this.data[z * this.width + x] = 0;
            this.corridorCells.push({ x, z });

            // Widen to 7 units
            if (z > 1) this.data[(z - 1) * this.width + x] = 0;
            if (z > 2) this.data[(z - 2) * this.width + x] = 0;
            if (z > 3) this.data[(z - 3) * this.width + x] = 0;
            if (z < this.height - 2) this.data[(z + 1) * this.width + x] = 0;
            if (z < this.height - 3) this.data[(z + 2) * this.width + x] = 0;
            if (z < this.height - 4) this.data[(z + 3) * this.width + x] = 0;
        }
    }

    createVCorridor(z1, z2, x) {
        const start = Math.min(z1, z2);
        const end = Math.max(z1, z2);
        for (let z = start; z <= end; z++) {
            this.data[z * this.width + x] = 0;
            this.corridorCells.push({ x, z });

            // Widen to 7 units
            if (x > 1) this.data[z * this.width + (x - 1)] = 0;
            if (x > 2) this.data[z * this.width + (x - 2)] = 0;
            if (x > 3) this.data[z * this.width + (x - 3)] = 0;
            if (x < this.width - 2) this.data[z * this.width + (x + 1)] = 0;
            if (x < this.width - 3) this.data[z * this.width + (x + 2)] = 0;
            if (x < this.width - 4) this.data[z * this.width + (x + 3)] = 0;
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
            bossSpawn: { x: cx, z: cz }
        };
    }
}
