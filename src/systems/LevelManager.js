import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CONSTANTS } from '../core/Constants.js';
import { MapGenerator } from './MapGenerator.js';
import { TextureGenerator } from './TextureGenerator.js';
import { ThemeManager } from './themes/ThemeManager.js';
import { Pathfinder } from './Pathfinder.js';
import { SkyColliders } from './SkyColliders.js';

const H = CONSTANTS.WALL_HEIGHT;
const FLOOR_TILE = 4; // Metres covered by one floor texture tile
const RUNE_VARIANTS = 4;

// Every material of one theme. Built when the theme changes (every 5 levels) and shared by all its
// levels, so textures are painted once per theme. See ART_DIRECTION.md for the rules they follow.
class ThemeKit {
    constructor(theme) {
        this.theme = theme;
        this.materials = [];
        const biome = theme.biome;
        const surface = (canvases, options = {}) => {
            const { map, bumpMap, emissiveMap } = TextureGenerator.toTextures(canvases);
            return this._keep(new THREE.MeshStandardMaterial({
                map,
                bumpMap,
                bumpScale: 1,
                emissiveMap,
                emissive: emissiveMap ? 0xffffff : 0x000000,
                emissiveIntensity: emissiveMap ? 1.5 : 0,
                roughness: 0.9,
                metalness: 0,
                ...options
            }));
        };

        this.walls = [0, 1, 2].map(v => surface(TextureGenerator.wallSurface(biome, v)));
        this.runeWalls = Array.from({ length: RUNE_VARIANTS }, (_, v) =>
            surface(TextureGenerator.runeWallSurface(v), { roughness: 0.55, emissiveIntensity: 1.3 }));
        this.vaultWall = surface(TextureGenerator.vaultWallSurface(), { roughness: 0.5, metalness: 0.25, emissiveIntensity: 0.6 });

        // The floor tile is shared with the island caps; only the floor gets the per-level aoMap
        this.floor = surface(TextureGenerator.floorSurface(biome), { roughness: 0.95 });
        this.islandCap = this._keep(new THREE.MeshStandardMaterial({
            map: this.floor.map,
            bumpMap: this.floor.bumpMap,
            roughness: 0.95,
            metalness: 0
        }));

        this.sky = this._keep(new THREE.MeshBasicMaterial({
            map: TextureGenerator.toTexture(TextureGenerator.skyCanvas(biome), { repeat: false }),
            side: THREE.BackSide,
            fog: false // The sky is the backdrop the fog fades into
        }));
        this.pentacle = this._keep(new THREE.MeshBasicMaterial({
            map: TextureGenerator.toTexture(TextureGenerator.pentacleCanvas(), { repeat: false }),
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2
        }));

        // Floating island details
        this.rune = this._keep(new THREE.MeshStandardMaterial({ color: 0x0c0a12, emissive: theme.accent, emissiveIntensity: 2, roughness: 0.3 }));
        this.foliage = this._keep(new THREE.MeshStandardMaterial({ color: theme.foliage, roughness: 0.9 }));
        this.wood = this._keep(new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.85 }));
    }

    _keep(material) {
        material.userData.kit = true; // Survives LevelManager._disposeLevel
        this.materials.push(material);
        return material;
    }

    dispose() {
        const textures = new Set();
        for (const m of this.materials) {
            for (const t of [m.map, m.bumpMap, m.emissiveMap]) if (t) textures.add(t);
            m.dispose();
        }
        textures.forEach(t => t.dispose());
    }
}

export class LevelManager {
    constructor(scene) {
        this.scene = scene;
        this.width = 0;
        this.height = 0;
        this.data = [];
        this.cellSize = CONSTANTS.CELL_SIZE;
        this.levelData = null;
        this.levelMeshGroup = new THREE.Group();
        this.scene.add(this.levelMeshGroup);
        this.currentLevelIndex = 1;
        this.decorationPositions = []; // Track decoration positions
        this.themeManager = new ThemeManager();
        this.kit = null;
        this.floorShadow = null;
        // Shared by every enemy: A* is synchronous, so one set of search buffers is enough
        this.pathfinder = new Pathfinder(this);
    }

    generateLevel(width, height, levelIndex = 1) {
        this.currentLevelIndex = levelIndex;
        const isBossLevel = levelIndex % 10 === 0;
        const generator = new MapGenerator(width, height);
        const levelData = isBossLevel ? generator.generateArena() : generator.generate();

        this.loadLevelData(levelData);

        // Chests sit in the dedicated treasure rooms
        this.chestPositions = !isBossLevel && levelData.treasureSpawn ? [levelData.treasureSpawn] : [];
        this.chestPositionsFloor1 = !isBossLevel && levelData.treasureSpawnFloor1 ? [levelData.treasureSpawnFloor1] : [];

        return levelData.playerStart;
    }

    loadLevelData(levelData) {
        this.levelData = levelData;
        this.width = levelData.width;
        this.height = levelData.height;
        this.data = levelData.data;
        this.dataFloor1 = levelData.dataFloor1 || new Array(this.width * this.height).fill(0);
        this.dataFloor2 = levelData.dataFloor2 || null;
        this.cellSize = levelData.cellSize || CONSTANTS.CELL_SIZE;
        this.buildLevel();
    }

    _getKit(theme) {
        if (!this.kit || this.kit.theme !== theme) {
            if (this.kit) this.kit.dispose();
            this.kit = new ThemeKit(theme);
        }
        return this.kit;
    }

    // Free the GPU resources of the previous level (theme kit materials are kept)
    _disposeLevel() {
        this.levelMeshGroup.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.isInstancedMesh) obj.dispose();
            if (!obj.material || obj.material.userData.kit) return;
            for (const t of [obj.material.map, obj.material.bumpMap, obj.material.emissiveMap]) if (t) t.dispose();
            obj.material.dispose();
        });
        this.levelMeshGroup.clear();
        if (this.floorShadow) this.floorShadow.dispose();
        this.floorShadow = null;
        this.skyColliders = null;
    }

    // Special room type ('event' | 'treasure') of each Floor 0 floor cell, null otherwise
    _computeSpecialFloorCells() {
        const cells = new Array(this.width * this.height).fill(null);
        for (const room of this.levelData.rooms || []) {
            if (room.type !== 'event' && room.type !== 'treasure') continue;
            for (let z = Math.max(0, room.z); z < Math.min(this.height, room.z + room.h); z++) {
                for (let x = Math.max(0, room.x); x < Math.min(this.width, room.x + room.w); x++) {
                    const i = z * this.width + x;
                    if (cells[i] === null && this.data[i] === 0) cells[i] = room.type;
                }
            }
        }
        return cells;
    }

    // Walls next to an event/treasure room get that room's look
    getRoomTypeForWall(x, z, specialCells) {
        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                const nz = z + dz;
                if (nx >= 0 && nx < this.width && nz >= 0 && nz < this.height) {
                    const type = specialCells[nz * this.width + nx];
                    if (type) return type;
                }
            }
        }
        return null;
    }

    buildLevel() {
        this._disposeLevel();

        const theme = this.themeManager.getTheme(this.currentLevelIndex);
        const kit = this._getKit(theme);
        const wallGeo = new THREE.BoxGeometry(this.cellSize, H, this.cellSize);
        const rampGeo = this.createRampGeometry(this.cellSize, H / 2, this.cellSize);
        const boxHalfGeo = new THREE.BoxGeometry(this.cellSize, H / 2, this.cellSize);
        const randomWall = () => kit.walls[Math.floor(Math.random() * kit.walls.length)];

        const pickWallMat = (roomType) => {
            if (roomType === 'event') return kit.runeWalls[Math.floor(Math.random() * kit.runeWalls.length)];
            if (roomType === 'treasure') return kit.vaultWall;
            return randomWall();
        };

        // Every wall, ramp and ramp base is an instance: one draw call per (geometry, material)
        const instances = new Map(); // geometry -> material -> matrices
        const addInstance = (geometry, material, matrix) => {
            if (!instances.has(geometry)) instances.set(geometry, new Map());
            const byMaterial = instances.get(geometry);
            if (!byMaterial.has(material)) byMaterial.set(material, []);
            byMaterial.get(material).push(matrix);
        };
        const addWall = (mat, posX, posY, posZ) => addInstance(wallGeo, mat, new THREE.Matrix4().makeTranslation(posX, posY, posZ));
        const RAMP_YAW = { 2: Math.PI, 3: 0, 4: -Math.PI / 2, 5: Math.PI / 2 }; // North, South, West, East
        const yaw = new THREE.Matrix4();
        const addRamp = (cellType, posX, posZ, baseY) => {
            const rampMat = randomWall();
            const isHigh = cellType >= 6;
            // Half-height box under the upper half of a long ramp
            if (isHigh) addInstance(boxHalfGeo, rampMat, new THREE.Matrix4().makeTranslation(posX, baseY + H / 4, posZ));
            const matrix = new THREE.Matrix4().makeTranslation(posX, baseY + (isHigh ? H / 2 : 0), posZ);
            addInstance(rampGeo, rampMat, matrix.multiply(yaw.makeRotationY(RAMP_YAW[isHigh ? cellType - 4 : cellType])));
        };

        const floors = [this.data, this.dataFloor1, this.dataFloor2];
        const specialCells = this._computeSpecialFloorCells();

        for (let z = 0; z < this.height; z++) {
            for (let x = 0; x < this.width; x++) {
                const index = z * this.width + x;
                const posX = x * this.cellSize + this.cellSize / 2;
                const posZ = z * this.cellSize + this.cellSize / 2;

                floors.forEach((grid, floor) => {
                    if (!grid) return;
                    const cellType = grid[index];
                    if (cellType === 1) {
                        addWall(pickWallMat(this.getRoomTypeForWall(x, z, specialCells)), posX, H * floor + H / 2, posZ);
                    } else if (cellType >= 2 && cellType <= 9 && floor < 2) {
                        addRamp(cellType, posX, posZ, H * floor);
                    }
                });
            }
        }

        for (const [geometry, byMaterial] of instances) {
            for (const [mat, matrices] of byMaterial) {
                const mesh = new THREE.InstancedMesh(geometry, mat, matrices.length);
                matrices.forEach((m, j) => mesh.setMatrixAt(j, m));
                mesh.instanceMatrix.needsUpdate = true;
                this.levelMeshGroup.add(mesh);
            }
        }

        this._buildFloor(kit);
        this.createSkybox(kit);

        if (this.levelData.rooms) {
            this.addDecorations(this.levelData.rooms, theme);
            this.levelMeshGroup.add(this.createSkyIslands(kit));
        }
    }

    // Tiled floor (one texture tile per FLOOR_TILE metres) with soft wall shadows and pentacles in event rooms
    _buildFloor(kit) {
        const w = this.width * this.cellSize;
        const d = this.height * this.cellSize;
        const geometry = new THREE.PlaneGeometry(w, d);
        const uv = geometry.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / FLOOR_TILE, uv.getY(i) * d / FLOOR_TILE);

        // The shadow map covers the whole level once: undo the tiling for it
        this.floorShadow = TextureGenerator.toTexture(TextureGenerator.floorShadowCanvas(this.levelData), { color: false, repeat: false });
        this.floorShadow.repeat.set(FLOOR_TILE / w, FLOOR_TILE / d);
        kit.floor.aoMap = this.floorShadow;
        kit.floor.needsUpdate = true;

        const floor = new THREE.Mesh(geometry, kit.floor);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(w / 2, 0, d / 2);
        this.levelMeshGroup.add(floor);

        for (const room of this.levelData.rooms || []) {
            if (room.type !== 'event') continue;
            const decal = new THREE.Mesh(new THREE.PlaneGeometry(room.w * this.cellSize * 0.9, room.h * this.cellSize * 0.9), kit.pentacle);
            decal.rotation.x = -Math.PI / 2;
            decal.position.set((room.x + room.w / 2) * this.cellSize, 0.02, (room.z + room.h / 2) * this.cellSize);
            this.levelMeshGroup.add(decal);
        }
    }

    // Decorative floating islands + bridges around the map. They are static, so every part is
    // merged into one mesh per material (a few draw calls instead of thousands).
    createSkyIslands(kit) {
        const capMat = kit.islandCap;
        const stoneMat = kit.walls[0];
        const vineMat = kit.foliage;
        const runeMat = kit.rune;
        const woodMat = kit.wood;
        const stoneMatBridge = kit.walls[1];
        const vineMatBridge = kit.foliage;
        const root = new THREE.Group();
        const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y, z);
            parent.add(mesh);
            return mesh;
        };

        const mapW = this.width * this.cellSize;
        const mapH = this.height * this.cellSize;
        const islands = [];

        // 80 to 120 islands, spawned with a +100% margin around the map
        const totalIslands = 80 + Math.floor(Math.random() * 40);
        for (let k = 0; k < totalIslands; k++) {
            const island = new THREE.Group();
            island.position.set(-mapW / 2 + Math.random() * (mapW * 2), 8.0 + Math.random() * 32.0, -mapH / 2 + Math.random() * (mapH * 2));
            const islandType = Math.floor(Math.random() * 3);

            if (islandType === 0) {
                // CLASSIC: box with a cone underneath
                const blockW = (2.0 + Math.random() * 4.0) * 1.4;
                const blockH = (1.0 + Math.random() * 2.0) * 1.4;
                const blockD = (2.0 + Math.random() * 4.0) * 1.4;
                add(island, new THREE.BoxGeometry(blockW, blockH, blockD), stoneMat);
                add(island, new THREE.BoxGeometry(blockW + 0.1, 0.15, blockD + 0.1), capMat, 0, blockH / 2 + 0.055, 0);
                add(island, new THREE.ConeGeometry((blockW + blockD) * 0.17, blockH * 1.5, 4), stoneMat, 0, -(blockH / 2 + blockH * 0.75), 0).rotation.x = Math.PI;

                if (blockW * blockD > 25 && Math.random() > 0.3) {
                    // Runic temple
                    const temple = add(island, new THREE.BoxGeometry(2.0, 2.5, 2.0), stoneMat, 0, blockH / 2 + 1.25, 0);
                    add(temple, new THREE.ConeGeometry(1.8, 1.5, 4), stoneMat, 0, 1.25 + 0.75, 0).rotation.y = Math.PI / 4;
                    add(temple, new THREE.BoxGeometry(1.0, 1.0, 2.1), runeMat);
                } else if (Math.random() > 0.5) {
                    // Crystal
                    add(island, new THREE.OctahedronGeometry(0.18 + Math.random() * 0.08, 0), runeMat, 0, blockH / 2 + 0.2, 0);
                }
            } else if (islandType === 1) {
                // PILLAR CLUSTER (basalt-like columns)
                const numPillars = 3 + Math.floor(Math.random() * 4);
                for (let p = 0; p < numPillars; p++) {
                    const pw = (0.8 + Math.random() * 1.0) * 1.4;
                    const ph = (4.0 + Math.random() * 6.0) * 1.4;
                    const pillar = add(island, new THREE.CylinderGeometry(pw, pw * 0.7, ph, 6), stoneMat,
                        (Math.random() - 0.5) * 3.0, (Math.random() - 0.5) * 2.0, (Math.random() - 0.5) * 3.0);
                    pillar.rotation.x = (Math.random() - 0.5) * 0.2;
                    pillar.rotation.z = (Math.random() - 0.5) * 0.2;

                    const cap = add(island, new THREE.CylinderGeometry(pw + 0.05, pw + 0.05, 0.2, 6), capMat,
                        pillar.position.x, pillar.position.y + ph / 2 + 0.1, pillar.position.z);
                    cap.rotation.copy(pillar.rotation);
                }
            } else {
                // RUINS: flat circular island with standing stones
                const radius = (2.5 + Math.random() * 2.0) * 1.4;
                const thickness = (0.8 + Math.random() * 1.0) * 1.4;
                add(island, new THREE.CylinderGeometry(radius, radius * 0.5, thickness, 8), stoneMat);
                add(island, new THREE.CylinderGeometry(radius + 0.1, radius + 0.1, 0.15, 8), capMat, 0, thickness / 2 + 0.055, 0);

                if (radius > 4.5 && Math.random() > 0.3) {
                    // Hexagonal temple
                    const temple = add(island, new THREE.CylinderGeometry(1.5, 1.5, 3.0, 6), stoneMat, 0, thickness / 2 + 1.5, 0);
                    add(temple, new THREE.ConeGeometry(2.0, 2.0, 6), stoneMat, 0, 1.5 + 1.0, 0);
                    add(temple, new THREE.CylinderGeometry(1.55, 1.55, 0.5, 6), runeMat);
                }

                const numStones = 2 + Math.floor(Math.random() * 4);
                for (let s = 0; s < numStones; s++) {
                    const sw = 0.4 + Math.random() * 0.3;
                    const sh = 1.0 + Math.random() * 2.0;
                    const sd = 0.4 + Math.random() * 0.3;
                    const angle = (s / numStones) * Math.PI * 2 + Math.random();
                    const dist = radius * 0.6;
                    const stone = add(island, new THREE.BoxGeometry(sw, sh, sd), stoneMat,
                        Math.cos(angle) * dist, thickness / 2 + sh / 2, Math.sin(angle) * dist);
                    stone.rotation.y = -angle; // Face outward
                    // Small glowing rune band on the stone
                    add(island, new THREE.BoxGeometry(sw * 1.1, sh * 0.3, sd * 1.1), runeMat).position.copy(stone.position);
                }
            }

            // Satellite shards and hanging vines on every type
            const shardCount = Math.floor(Math.random() * 3);
            for (let s = 0; s < shardCount; s++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 3.0 + Math.random() * 3.0;
                add(island, new THREE.BoxGeometry(0.5, 0.5, 0.5), stoneMat, Math.cos(angle) * dist, (Math.random() - 0.5) * 2.0, Math.sin(angle) * dist)
                    .rotation.set(Math.random(), Math.random(), Math.random());
            }
            const vineCount = Math.floor(Math.random() * 4);
            for (let v = 0; v < vineCount; v++) {
                const vineH = 1.0 + Math.random() * 2.0;
                const vine = add(island, new THREE.CylinderGeometry(0.03, 0.015, vineH, 4), vineMat,
                    (Math.random() - 0.5) * 2.0, -vineH / 2 - 0.5, (Math.random() - 0.5) * 2.0);
                vine.rotation.z = (Math.random() - 0.5) * 0.3;
                vine.rotation.x = (Math.random() - 0.5) * 0.3;
            }

            root.add(island);
            islands.push({ mesh: island, connections: 0 });
        }

        // Bridges: each island links to at most 2 neighbours
        for (let i = 0; i < islands.length; i++) {
            const islA = islands[i];
            for (let j = i + 1; j < islands.length && islA.connections < 2; j++) {
                const islB = islands[j];
                if (islB.connections >= 2) continue;

                const a = islA.mesh.position;
                const b = islB.mesh.position;
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const dz = a.z - b.z;
                const horizDist = Math.sqrt(dx * dx + dz * dz);
                if (horizDist <= 4.0 || horizDist >= 20.0 || Math.abs(dy) >= 6.0) continue;

                const dist3D = Math.sqrt(dx * dx + dy * dy + dz * dz);
                const bridge = new THREE.Group();
                bridge.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
                bridge.lookAt(b.x, b.y, b.z);

                const connType = Math.floor(Math.random() * 3);
                if (connType === 0) {
                    // Wood bridge with a sag curve
                    const numPlanks = Math.floor(dist3D / 0.8);
                    for (let p = 0; p < numPlanks; p++) {
                        const t = p / (numPlanks - 1);
                        const plank = add(bridge, new THREE.BoxGeometry(1.5, 0.15, 0.5), woodMat, 0, -Math.sin(t * Math.PI) * (dist3D * 0.15), (t - 0.5) * dist3D);
                        plank.rotation.z = (Math.random() - 0.5) * 0.2;
                        plank.rotation.x = (Math.random() - 0.5) * 0.2;
                    }
                } else if (connType === 1) {
                    // Stone arch
                    const numStones = Math.floor(dist3D / 1.2);
                    for (let p = 0; p < numStones; p++) {
                        const t = p / (numStones - 1);
                        const stone = add(bridge, new THREE.BoxGeometry(2.0, 0.8, 1.2), stoneMatBridge, 0, Math.sin(t * Math.PI) * (dist3D * 0.2), (t - 0.5) * dist3D);
                        stone.rotation.x = -(t - 0.5) * Math.PI * 0.5; // Follow the arch
                        stone.rotation.y = (Math.random() - 0.5) * 0.1;
                        stone.rotation.z = (Math.random() - 0.5) * 0.1;
                    }
                } else {
                    // Giant twisted vines / roots
                    const numVines = 2 + Math.floor(Math.random() * 2);
                    for (let v = 0; v < numVines; v++) {
                        const numSegments = Math.floor(dist3D / 1.5);
                        const vineRadius = 0.2 + Math.random() * 0.3;
                        const vineOffset = (Math.random() - 0.5) * 1.5;
                        for (let s = 0; s < numSegments; s++) {
                            const t = s / (numSegments - 1);
                            const sag = Math.sin(t * Math.PI) * (dist3D * 0.2) + (Math.random() - 0.5) * 0.5;
                            const xPos = Math.sin(t * Math.PI * 4 + v) * 0.8 + vineOffset; // Twist around center
                            const segment = add(bridge, new THREE.CylinderGeometry(vineRadius, vineRadius * 0.8, 1.8, 5), vineMatBridge, xPos, -sag, (t - 0.5) * dist3D);
                            segment.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
                            segment.rotation.z = (Math.random() - 0.5) * 0.5;
                        }
                    }
                }

                root.add(bridge);
                islA.connections++;
                islB.connections++;
            }
        }

        // Islands and bridges are solid (projectiles bounce off, the player stands on them)
        root.updateMatrixWorld(true);
        this.skyColliders = new SkyColliders();
        root.traverse(obj => obj.isMesh && this.skyColliders.add(obj));

        return this._mergeByMaterial(root);
    }

    // Bake every mesh of a static hierarchy into one merged mesh per material
    _mergeByMaterial(root) {
        root.updateMatrixWorld(true);
        const buckets = new Map();
        root.traverse(obj => {
            if (!obj.isMesh) return;
            const geo = obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry.clone();
            geo.applyMatrix4(obj.matrixWorld);
            obj.geometry.dispose();
            if (!buckets.has(obj.material)) buckets.set(obj.material, []);
            buckets.get(obj.material).push(geo);
        });

        const merged = new THREE.Group();
        for (const [mat, geos] of buckets) {
            const geo = mergeGeometries(geos);
            geos.forEach(g => g.dispose());
            if (geo) merged.add(new THREE.Mesh(geo, mat));
        }
        return merged;
    }

    createSkybox(kit) {
        const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), kit.sky);
        sky.position.set((this.width * this.cellSize) / 2, 0, (this.height * this.cellSize) / 2);
        this.levelMeshGroup.add(sky);
    }

    // Room lights in the theme colour (prop decorations are disabled)
    addDecorations(rooms, theme) {
        this.decorationPositions = [];
        const { point, pointIntensity } = theme.lighting;
        for (const room of rooms) {
            if (Math.random() >= 0.4) continue;
            const cx = Math.floor(room.x + room.w / 2);
            const cz = Math.floor(room.z + room.h / 2);
            const light = new THREE.PointLight(point, pointIntensity, 14);
            light.position.set(cx * this.cellSize + this.cellSize / 2, 2.2, cz * this.cellSize + this.cellSize / 2);
            this.levelMeshGroup.add(light);
        }
    }

    // ─── Spatial queries ─────────────────────────────────────────────────────

    // World X/Z of a grid cell centre
    gridToWorld(g) {
        return g * this.cellSize + this.cellSize / 2;
    }

    // World position on the floor at the centre of a grid cell. `checkY` picks the floor level.
    floorPositionAt(gridX, gridZ, checkY = 0, target = new THREE.Vector3()) {
        const x = this.gridToWorld(gridX);
        const z = this.gridToWorld(gridZ);
        return target.set(x, this.getFloorHeight(x, z, checkY), z);
    }

    isWall(x, z, groundY = 0) {
        const gridX = Math.floor(x / this.cellSize);
        const gridZ = Math.floor(z / this.cellSize);
        if (gridX < 0 || gridX >= this.width || gridZ < 0 || gridZ >= this.height) {
            return true; // Out of bounds = wall
        }
        const index = gridZ * this.width + gridX;

        // Each floor's walls only block entities standing within that floor's height band
        if (groundY >= H * 2 - 0.1) {
            return !!this.dataFloor2 && this.dataFloor2[index] === 1 && groundY < H * 3 - 0.1;
        }
        if (groundY >= H - 0.1) {
            return !!this.dataFloor1 && this.dataFloor1[index] === 1 && groundY < H * 2 - 0.1;
        }
        return this.data[index] === 1;
    }

    // Random walkable cell on a random floor: { x, z } grid coordinates + y = floor height
    getRandomEmptyPosition() {
        for (let attempts = 0; attempts < 100; attempts++) {
            const x = Math.floor(Math.random() * this.width);
            const z = Math.floor(Math.random() * this.height);
            const idx = z * this.width + x;
            const r = Math.random();

            if (r < 0.15 && this.dataFloor2) {
                // 15%: Floor 2 (top of Floor 1 walls)
                if (this.dataFloor1[idx] === 1 && this.dataFloor2[idx] === 0) return { x, z, y: H * 2 };
            } else if (r < 0.50 && this.dataFloor1) {
                // 35%: Floor 1 (top of Floor 0 walls)
                if (this.data[idx] === 1 && this.dataFloor1[idx] === 0) return { x, z, y: H };
            } else if (this.data[idx] === 0) {
                // 50%: Floor 0
                return { x, z, y: 0 };
            }
        }
        return null;
    }

    isDecoration(x, z) {
        if (this.decorationPositions.length === 0) return false;
        const gridX = Math.floor(x / this.cellSize);
        const gridZ = Math.floor(z / this.cellSize);
        return this.decorationPositions.some(deco => deco.x === gridX && deco.z === gridZ);
    }

    interpolateRampGeometryHeight(type, localX, localZ) {
        const half = H / 2;
        switch (type) {
            case 2: return (1 - localZ) * half;
            case 3: return localZ * half;
            case 4: return (1 - localX) * half;
            case 5: return localX * half;
            case 6: return half + (1 - localZ) * half;
            case 7: return half + localZ * half;
            case 8: return half + (1 - localX) * half;
            case 9: return half + localX * half;
            default: return 0;
        }
    }

    getFloorHeight(x, z, groundY = 0) {
        if (!this.width || !this.height || !this.data) return 0;
        const gridX = Math.floor(x / this.cellSize);
        const gridZ = Math.floor(z / this.cellSize);
        if (gridX < 0 || gridX >= this.width || gridZ < 0 || gridZ >= this.height) return 0;

        const index = gridZ * this.width + gridX;
        const type = this.data[index];
        const typeFloor1 = this.dataFloor1 ? this.dataFloor1[index] : 0;
        const typeFloor2 = this.dataFloor2 ? this.dataFloor2[index] : 0;
        const localX = (x - gridX * this.cellSize) / this.cellSize;
        const localZ = (z - gridZ * this.cellSize) / this.cellSize;

        // Floor 2 wall / platform
        if (groundY >= H * 2 - 0.1) {
            if (typeFloor2 === 1) return groundY >= H * 3 - 0.1 ? H * 3 : H * 2;
            if (typeFloor2 === 10) return H * 2; // Floating platform
        }

        if (groundY >= H - 0.1) {
            // Ramp up to Floor 2
            if (typeFloor1 >= 2 && typeFloor1 <= 9) return H + this.interpolateRampGeometryHeight(typeFloor1, localX, localZ);
            // Floor 1 wall / platform
            if (typeFloor1 === 1) return groundY >= H * 2 - 0.1 ? H * 2 : H;
            if (typeFloor1 === 10) return H; // Floating platform
            if (type === 1) return H; // Walkable top of Floor 0 wall
            // Floor 0 ramps fall through to the Floor 0 calculation
        }

        if (type === 1) return 0;
        return this.interpolateRampGeometryHeight(type, localX, localZ);
    }

    // Height at which walls are tested for something standing on `floorY` (feet at `feetY`).
    // Snaps to the floor band so that ramps don't make walls of the next floor block.
    getCollisionCheckY(floorY, feetY) {
        if (floorY >= H + H / 2 - 0.1) return H * 2;
        if (floorY >= H / 2 - 0.1) return H;
        return feetY;
    }

    // Push a circle (x/z of `pos`, radius `r`) out of the wall cells around it. Mutates `pos`.
    resolveCircleCollision(pos, r, checkY) {
        const size = this.cellSize;
        // 2 passes so diagonal corner collisions are resolved cleanly
        for (let pass = 0; pass < 2; pass++) {
            const gridX = Math.floor(pos.x / size);
            const gridZ = Math.floor(pos.z / size);

            for (let dz = -1; dz <= 1; dz++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const gx = gridX + dx;
                    const gz = gridZ + dz;
                    const cx = (gx + 0.5) * size;
                    const cz = (gz + 0.5) * size;
                    if (!this.isWall(cx, cz, checkY) && !this.isDecoration(cx, cz)) continue; // isWall: out of bounds = wall

                    // Closest point of the cell box to the circle centre
                    const diffX = pos.x - Math.max(gx * size, Math.min(pos.x, gx * size + size));
                    const diffZ = pos.z - Math.max(gz * size, Math.min(pos.z, gz * size + size));
                    const distSq = diffX * diffX + diffZ * diffZ;
                    if (distSq >= r * r) continue;

                    const dist = Math.sqrt(distSq);
                    if (dist > 0.0001) {
                        const overlap = r - dist;
                        pos.x += (diffX / dist) * overlap;
                        pos.z += (diffZ / dist) * overlap;
                    } else {
                        // Centre inside the box: push out from the cell centre
                        const pdx = pos.x - cx;
                        const pdz = pos.z - cz;
                        const pdist = Math.sqrt(pdx * pdx + pdz * pdz);
                        if (pdist > 0.0001) {
                            pos.x += (pdx / pdist) * r;
                            pos.z += (pdz / pdist) * r;
                        } else {
                            pos.x += r; // Fallback push
                        }
                    }
                }
            }
        }
    }

    createRampGeometry(w, h, d) {
        const A = [-w / 2, 0, -d / 2];
        const B = [w / 2, 0, -d / 2];
        const C = [-w / 2, 0, d / 2];
        const D = [w / 2, 0, d / 2];
        const E = [-w / 2, h, d / 2];
        const F = [w / 2, h, d / 2];

        const vertices = [];
        const normals = [];
        const uvs = [];
        const addTriangle = (v1, v2, v3, n, uv1, uv2, uv3) => {
            vertices.push(...v1, ...v2, ...v3);
            normals.push(...n, ...n, ...n);
            uvs.push(...uv1, ...uv2, ...uv3);
        };

        // Front face (South: 0, 0, 1)
        addTriangle(D, C, E, [0, 0, 1], [1, 0], [0, 0], [0, 1]);
        addTriangle(D, E, F, [0, 0, 1], [1, 0], [0, 1], [1, 1]);
        // Left face (-1, 0, 0)
        addTriangle(A, C, E, [-1, 0, 0], [0, 0], [1, 0], [1, 1]);
        // Right face (1, 0, 0)
        addTriangle(D, B, F, [1, 0, 0], [0, 0], [1, 0], [0, 1]);
        // Slope face (pointing up-backwards)
        const L = Math.sqrt(d * d + h * h);
        const nSlope = [0, d / L, -h / L];
        addTriangle(B, A, E, nSlope, [1, 0], [0, 0], [0, 1]);
        addTriangle(B, E, F, nSlope, [1, 0], [0, 1], [1, 1]);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        return geometry;
    }
}
