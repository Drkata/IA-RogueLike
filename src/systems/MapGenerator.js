import { CONSTANTS } from '../core/Constants.js';

export class MapGenerator {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = [];
        this.corridorCells = []; // Candidate cells for spike traps
    }

    generate() {
        const MAX_ATTEMPTS = 50;
        let attempt = 1;
        while (attempt <= MAX_ATTEMPTS) {
            const levelData = this._generateSingle();
            if (this.isValidMap(levelData.playerStart)) {
                return levelData;
            }
            attempt++;
        }
        console.warn("Failed to generate fully connected map after", MAX_ATTEMPTS, "attempts. Returning fallback.");
        return this._generateSingle();
    }

    _generateSingle() {
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
                    this.createHCorridor(prevCenter.x, newCenter.x, prevCenter.z);
                }
            }
        });

        const spikeTraps = [];

        // 3.5 Enclose Special Rooms (after corridors have opened them up too much)
        const eventRoomToEnclose = rooms.find(r => r.type === 'event') || rooms[rooms.length - 1];
        const treasureRoomToEnclose = rooms.find(r => r.type === 'treasure') || rooms[Math.floor(rooms.length / 2)];
        
        this.encloseRoom(eventRoomToEnclose, spikeTraps);
        this.encloseRoom(treasureRoomToEnclose, spikeTraps);

        // 4. Ensure player start is in the center of the Safe Room
        const startRoom = rooms[0];
        const playerStart = this.getCenter(startRoom);

        // 5. Select Spike Trap Positions from Corridors
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
        // 7. Event Room setups (Altar or Fountain)
        const eventRoom = rooms.find(r => r.type === 'event') || rooms[rooms.length - 1];
        const eventSpawn = this.getExactCenter(eventRoom);
        const randEvent = Math.random();
        const eventType = randEvent < 0.4 ? 'altar' : (randEvent < 0.8 ? 'shop' : 'fountain');

        // 8. Treasure Room setups
        const treasureRoom = rooms.find(r => r.type === 'treasure') || rooms[Math.floor(rooms.length / 2)];
        const treasureSpawn = this.getExactCenter(treasureRoom);

        // 9. Sentinel setups (protecting events and treasures)
        const sentinels = [];
        const addSentinelsAround = (centerPos, count) => {
            const offsets = [
                {x: 2, z: 2}, {x: -2, z: -2}, {x: 2, z: -2}, {x: -2, z: 2},
                {x: 3, z: 0}, {x: -3, z: 0}, {x: 0, z: 3}, {x: 0, z: -3}
            ];
            let placed = 0;
            for (let i = 0; i < offsets.length && placed < count; i++) {
                const nx = Math.floor(centerPos.x) + offsets[i].x;
                const nz = Math.floor(centerPos.z) + offsets[i].z;
                if (nx >= 0 && nx < this.width && nz >= 0 && nz < this.height) {
                    if (this.data[nz * this.width + nx] === 0) { // is floor
                        sentinels.push({x: nx, z: nz});
                        placed++;
                    }
                }
            }
        };

        // 4 sentinels to protect the treasure, 2 for the event
        addSentinelsAround(treasureSpawn, 4);
        addSentinelsAround(eventSpawn, 2);

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
            treasureSpawn: treasureSpawn,
            corridorCells: this.corridorCells
        };
    }

    createRoom(room) {
        if (room.type === 'event' || room.type === 'treasure') {
            // Force special rooms to be isolated chambers
            const carveW = room.type === 'event' ? 8 : 11;
            const carveH = room.type === 'event' ? 8 : 11;
            const startX = Math.floor(room.x + (room.w - carveW) / 2);
            const startZ = Math.floor(room.z + (room.h - carveH) / 2);
            
            // Clamp coordinates to prevent out of bounds
            room.x = Math.max(2, Math.min(this.width - carveW - 2, startX));
            room.z = Math.max(2, Math.min(this.height - carveH - 2, startZ));
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

    getExactCenter(room) {
        return {
            x: room.x + room.w / 2 - 0.5,
            z: room.z + room.h / 2 - 0.5
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

    isValidMap(startPos) {
        let totalFloorCount = 0;
        for (let i = 0; i < this.data.length; i++) {
            if (this.data[i] === 0) totalFloorCount++;
        }

        const visited = new Set();
        const queue = [startPos];
        visited.add(startPos.z * this.width + startPos.x);

        let reachableCount = 0;

        while (queue.length > 0) {
            const current = queue.shift();
            reachableCount++;

            const neighbors = [
                { x: current.x, z: current.z - 1 },
                { x: current.x, z: current.z + 1 },
                { x: current.x - 1, z: current.z },
                { x: current.x + 1, z: current.z }
            ];

            for (const n of neighbors) {
                if (n.x >= 0 && n.x < this.width && n.z >= 0 && n.z < this.height) {
                    const idx = n.z * this.width + n.x;
                    if (this.data[idx] === 0 && !visited.has(idx)) {
                        visited.add(idx);
                        queue.push(n);
                    }
                }
            }
        }

        return reachableCount === totalFloorCount;
    }

    encloseRoom(room, trapsArray = null) {
        // Draw solid walls around the perimeter
        const px = room.x - 1;
        const pz = room.z - 1;
        const pw = room.w + 2;
        const ph = room.h + 2;
        
        for(let x = px; x < px + pw; x++) {
            if (x >= 0 && x < this.width && pz >= 0) this.data[pz * this.width + x] = 1;
            if (x >= 0 && x < this.width && (pz + ph - 1) < this.height) this.data[(pz + ph - 1) * this.width + x] = 1;
        }
        for(let z = pz; z < pz + ph; z++) {
            if (z >= 0 && z < this.height && px >= 0) this.data[z * this.width + px] = 1;
            if (z >= 0 && z < this.height && (px + pw - 1) < this.width) this.data[z * this.width + (px + pw - 1)] = 1;
        }

        // Find potential door locations by scanning the entire perimeter
        const doors = [];
        
        // North wall (z = pz)
        if (pz - 1 >= 0) {
            for (let x = px + 1; x < px + pw - 1; x++) {
                if (this.data[(pz - 1) * this.width + x] === 0) doors.push({x: x, z: pz, wall: 'H'});
            }
        }
        // South wall (z = pz + ph - 1)
        if (pz + ph < this.height) {
            for (let x = px + 1; x < px + pw - 1; x++) {
                if (this.data[(pz + ph) * this.width + x] === 0) doors.push({x: x, z: pz + ph - 1, wall: 'H'});
            }
        }
        // West wall (x = px)
        if (px - 1 >= 0) {
            for (let z = pz + 1; z < pz + ph - 1; z++) {
                if (this.data[z * this.width + px - 1] === 0) doors.push({x: px, z: z, wall: 'V'});
            }
        }
        // East wall (x = px + pw - 1)
        if (px + pw < this.width) {
            for (let z = pz + 1; z < pz + ph - 1; z++) {
                if (this.data[z * this.width + px + pw] === 0) doors.push({x: px + pw - 1, z: z, wall: 'V'});
            }
        }

        // Shuffle candidates
        doors.sort(() => Math.random() - 0.5);
        
        // Anti-softlock: if no doors found, force one and carve a path outwards
        if (doors.length === 0) {
            const cx = Math.floor(room.x + room.w / 2);
            doors.push({x: cx, z: pz, wall: 'H'}); 
            for(let i = 1; i < 6; i++) {
                if (pz - i >= 0) this.data[(pz - i) * this.width + cx] = 0;
            }
        }

        const selectedDoors = [];
        const numDoors = Math.max(1, Math.min(doors.length, 1 + Math.floor(Math.random() * 2)));
        
        for (const door of doors) {
            if (selectedDoors.length >= numDoors) break;
            
            // Ensure this door isn't too close to an already selected door
            let tooClose = false;
            for (const sd of selectedDoors) {
                if (Math.abs(sd.x - door.x) + Math.abs(sd.z - door.z) < 4) {
                    tooClose = true;
                    break;
                }
            }
            if (!tooClose) {
                selectedDoors.push(door);
            }
        }

        if (selectedDoors.length === 0 && doors.length > 0) {
            selectedDoors.push(doors[0]);
        }
        
        for (const door of selectedDoors) {
            this.data[door.z * this.width + door.x] = 0; // Main opening
            if (trapsArray) trapsArray.push({x: door.x, z: door.z});

            // Make it 2-wide to fit player and enemies easily
            if (door.wall === 'H') { // Horizontal wall
                if (door.x + 1 < this.width) {
                    this.data[door.z * this.width + door.x + 1] = 0;
                    if (trapsArray) trapsArray.push({x: door.x + 1, z: door.z});
                }
            } else { // Vertical wall
                if (door.z + 1 < this.height) {
                    this.data[(door.z + 1) * this.width + door.x] = 0;
                    if (trapsArray) trapsArray.push({x: door.x, z: door.z + 1});
                }
            }
        }
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
