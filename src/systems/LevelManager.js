import * as THREE from 'three';
import { CONSTANTS } from '../core/Constants.js';
import { MapGenerator } from './MapGenerator.js';
import { TextureGenerator } from './TextureGenerator.js';
import { ThemeManager } from './themes/ThemeManager.js';

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
        this.currentTheme = 0;
        this.currentLevelIndex = 1;
        this.decorationPositions = []; // Track decoration positions
        this.skyStructures = []; // Bounding boxes for sky platforms
        this.themeManager = new ThemeManager();
    }



    generateLevel(width, height, levelIndex = 1) {
        this.currentLevelIndex = levelIndex;
        this.currentTheme = (levelIndex - 1) % 3; // Cycle 3 themes
        const generator = new MapGenerator(width, height);

        let levelData;
        if (levelIndex % 10 === 0) {
            levelData = generator.generateArena();
        } else {
            levelData = generator.generate();
        }

        this.loadLevelData(levelData);

        // Generate Chest Positions (using the dedicated treasure spawn room)
        this.chestPositions = [];
        if (levelIndex % 10 !== 0 && levelData.treasureSpawn) {
            this.chestPositions.push(levelData.treasureSpawn);
        }

        return levelData.playerStart;
    }

    loadLevelData(levelData) {
        this.levelData = levelData;
        this.width = levelData.width;
        this.height = levelData.height;
        this.data = levelData.data;
        this.cellSize = levelData.cellSize || CONSTANTS.CELL_SIZE;
        this.buildLevel();
    }

    getThemeMaterials() {
        // Get theme data
        const theme = this.themeManager.getTheme(this.currentLevelIndex);
        const wallColors = theme.wallColors;
        const floorColor = theme.floorColor;
        const wallTextureType = theme.wallTextureType || 'bricks';
        const floorTextureType = theme.floorTextureType || 'grid';

        // Create wall materials with variations
        const wallMaterials = wallColors.map(color => {
            const colorHex = '#' + color.toString(16).padStart(6, '0');
            let tex;

            // Use appropriate texture type
            if (wallTextureType === 'bricks') {
                tex = TextureGenerator.createBricksTexture(colorHex);
            } else if (wallTextureType === 'noise') {
                tex = TextureGenerator.createNoiseTexture(colorHex);
            } else if (wallTextureType === 'panel') {
                const accentColor = '#' + theme.pointLightColor.toString(16).padStart(6, '0');
                tex = TextureGenerator.createPanelTexture(colorHex, accentColor);
            } else if (wallTextureType === 'circuit') {
                const accentColor = '#' + theme.pointLightColor.toString(16).padStart(6, '0');
                tex = TextureGenerator.createCircuitTexture(colorHex, accentColor);
            } else { // grid
                const color2Hex = '#' + (color + 0x222222).toString(16).padStart(6, '0');
                tex = TextureGenerator.createGridTexture(colorHex, color2Hex);
            }

            return new THREE.MeshStandardMaterial({
                map: tex,
                roughness: 0.7,
                metalness: 0.3
            });
        });

        // Create floor material
        const floorColorHex = '#' + floorColor.toString(16).padStart(6, '0');
        let floorTex;

        if (floorTextureType === 'hexagon') {
            const accentColor = '#' + theme.pointLightColor.toString(16).padStart(6, '0');
            floorTex = TextureGenerator.createHexagonTexture(floorColorHex, accentColor);
        } else if (floorTextureType === 'metal_floor') {
            floorTex = TextureGenerator.createMetalFloorTexture(floorColorHex);
        } else if (floorTextureType === 'slime') {
            floorTex = TextureGenerator.createSlimeTexture(floorColorHex, '#33ff33');
        } else if (floorTextureType === 'lava') {
            floorTex = TextureGenerator.createLavaTexture(floorColorHex, '#ff4400');
        } else {
            const mortarHex = '#1a1a1a';
            floorTex = TextureGenerator.createFlagstoneTexture(floorColorHex, mortarHex);
        }

        return {
            walls: wallMaterials, // Array of materials for variation
            floor: new THREE.MeshStandardMaterial({
                map: floorTex,
                roughness: 0.8,
                metalness: 0.2,
                vertexColors: true
            })
        };
    }

    buildLevel() {
        // Clear previous level
        this.levelMeshGroup.clear();
        this.skyStructures = [];

        const mats = this.getThemeMaterials();
        const wallGeo = new THREE.BoxGeometry(this.cellSize, CONSTANTS.WALL_HEIGHT, this.cellSize);

        // Prepare instance data
        const wallInstances = mats.walls.map(() => []);
        const NUM_EVENT_VARIATIONS = 15;
        const eventWallInstances = Array.from({length: NUM_EVENT_VARIATIONS}, () => []);
        const treasureWallMatrices = [];

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const index = y * this.width + x;
                if (this.data[index] === 1) {
                    const posX = x * this.cellSize + this.cellSize / 2;
                    const posY = CONSTANTS.WALL_HEIGHT / 2;
                    const posZ = y * this.cellSize + this.cellSize / 2;

                    const dummy = new THREE.Object3D();
                    dummy.position.set(posX, posY, posZ);
                    dummy.updateMatrix();

                    const roomType = this.getRoomTypeForWall(x, y);
                    if (roomType === 'event') {
                        const vIndex = Math.floor(Math.random() * NUM_EVENT_VARIATIONS);
                        eventWallInstances[vIndex].push(dummy.matrix.clone());
                    } else if (roomType === 'treasure') {
                        treasureWallMatrices.push(dummy.matrix.clone());
                    } else {
                        const matIndex = Math.floor(Math.random() * mats.walls.length);
                        wallInstances[matIndex].push(dummy.matrix.clone());
                    }
                }
            }
        }

        // Create standard InstancedMeshes
        wallInstances.forEach((matrices, i) => {
            if (matrices.length === 0) return;

            const mesh = new THREE.InstancedMesh(wallGeo, mats.walls[i], matrices.length);

            for (let j = 0; j < matrices.length; j++) {
                mesh.setMatrixAt(j, matrices[j]);
            }

            mesh.instanceMatrix.needsUpdate = true;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.levelMeshGroup.add(mesh);
        });

        // Create Event Room InstancedMesh (glowing purple obsidian walls)
        eventWallInstances.forEach((matrices) => {
            if (matrices.length === 0) return;
            const eventTex = TextureGenerator.createRuneWallTexture('#180c26', '#8a2be2');
            const eventWallMat = new THREE.MeshStandardMaterial({
                map: eventTex,
                color: 0xffffff, // White to show texture colors correctly
                emissive: 0x8a2be2, // Purple glow
                emissiveIntensity: 0.1, // Very low intensity so it doesn't wash out the texture
                emissiveMap: eventTex, // Make the bright parts of the texture glow
                roughness: 0.3,
                metalness: 0.8
            });
            const eventMesh = new THREE.InstancedMesh(wallGeo, eventWallMat, matrices.length);
            for (let j = 0; j < matrices.length; j++) {
                eventMesh.setMatrixAt(j, matrices[j]);
            }
            eventMesh.instanceMatrix.needsUpdate = true;
            eventMesh.castShadow = true;
            eventMesh.receiveShadow = true;
            this.levelMeshGroup.add(eventMesh);
        });

        // Create Treasure Room InstancedMesh (glimmering golden brass walls)
        if (treasureWallMatrices.length > 0) {
            const treasureTex = TextureGenerator.createVaultWallTexture('#3d290d', '#d4af37');
            const treasureWallMat = new THREE.MeshStandardMaterial({
                map: treasureTex,
                color: 0xffffff, // White to show texture colors correctly
                emissive: 0xd4af37, // Gold glow
                emissiveIntensity: 0.1, // Very low intensity
                emissiveMap: treasureTex,
                roughness: 0.2,
                metalness: 0.9
            });
            const treasureMesh = new THREE.InstancedMesh(wallGeo, treasureWallMat, treasureWallMatrices.length);
            for (let j = 0; j < treasureWallMatrices.length; j++) {
                treasureMesh.setMatrixAt(j, treasureWallMatrices[j]);
            }
            treasureMesh.instanceMatrix.needsUpdate = true;
            treasureMesh.castShadow = true;
            treasureMesh.receiveShadow = true;
            this.levelMeshGroup.add(treasureMesh);
        }

        // Setup floor with Baked Texture (Rock + Paths + AO)
        const theme = this.themeManager.getTheme(this.currentLevelIndex);
        const floorColorHex = '#' + theme.floorColor.toString(16).padStart(6, '0');
        const bakedTex = TextureGenerator.createBakedFloorTexture(this.levelData, floorColorHex, theme);
        mats.floor.map = bakedTex;
        mats.floor.vertexColors = false; // We don't need vertex colors anymore, everything is baked!
        mats.floor.needsUpdate = true;

        // Simple Floor Geometry (no subdivisions needed anymore)
        const floorGeo = new THREE.PlaneGeometry(this.width * this.cellSize, this.height * this.cellSize);
        const floor = new THREE.Mesh(floorGeo, mats.floor);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(
            (this.width * this.cellSize) / 2,
            0,
            (this.height * this.cellSize) / 2
        );
        floor.receiveShadow = true;
        this.levelMeshGroup.add(floor);

        // Skybox
        this.createSkybox();

        // Decorations
        if (this.levelData.rooms) {
            this.addDecorations(this.levelData.rooms, this.levelData.playerStart);
        }

        // Spawn Floating Sky Structures in rooms
        if (this.levelData.rooms) {
            const theme = this.themeManager.getTheme(this.currentLevelIndex);
            const capColor = theme.floorColor;

            const capMat = new THREE.MeshStandardMaterial({
                color: capColor,
                roughness: 0.8,
                metalness: 0.1
            });

            const stoneMat = new THREE.MeshStandardMaterial({
                color: 0x2b2e33, // Slate grey rock
                roughness: 0.9,
                metalness: 0.15
            });

            const vineMat = new THREE.MeshStandardMaterial({
                color: this.currentTheme === 3 ? 0x8b0000 : 0x2e8b57, // Crimson for Demonic, Forest Green for others
                roughness: 0.9,
                metalness: 0.1
            });
            
            const runeMat = new THREE.MeshStandardMaterial({
                color: 0x051a24,
                emissive: this.currentTheme === 1 ? 0x9400d3 : 0x00dfff, // Purple or Cyan glow
                emissiveIntensity: 1.8,
                roughness: 0.2,
                metalness: 0.9
            });

            const mapW = this.width * this.cellSize;
            const mapH = this.height * this.cellSize;

            // Spawn 80 to 120 floating islands across the expanded map surface (30% density increase)
            const totalIslands = 80 + Math.floor(Math.random() * 40);
            for (let k = 0; k < totalIslands; k++) {
                // Spawns with +100% margin around the map boundaries
                const posX = -mapW / 2 + Math.random() * (mapW * 2);
                const posZ = -mapH / 2 + Math.random() * (mapH * 2);
                const posY = 8.0 + Math.random() * 32.0;

                const structureGroup = new THREE.Group();
                structureGroup.position.set(posX, posY, posZ);

                const islandType = Math.floor(Math.random() * 3);

                if (islandType === 0) {
                    // TYPE 0: CLASSIC (Box with cone underneath)
                    const blockW = (2.0 + Math.random() * 4.0) * 1.4;
                    const blockH = (1.0 + Math.random() * 2.0) * 1.4;
                    const blockD = (2.0 + Math.random() * 4.0) * 1.4;

                    const blockGeo = new THREE.BoxGeometry(blockW, blockH, blockD);
                    const mainMesh = new THREE.Mesh(blockGeo, stoneMat);
                    structureGroup.add(mainMesh);

                    const capGeo = new THREE.BoxGeometry(blockW + 0.1, 0.15, blockD + 0.1);
                    const capMesh = new THREE.Mesh(capGeo, capMat);
                    capMesh.position.y = blockH / 2 + 0.055;
                    structureGroup.add(capMesh);

                    const coneGeo = new THREE.ConeGeometry((blockW + blockD) * 0.17, blockH * 1.5, 4);
                    const coneMesh = new THREE.Mesh(coneGeo, stoneMat);
                    coneMesh.rotation.x = Math.PI;
                    coneMesh.position.y = -(blockH / 2 + blockH * 0.75);
                    structureGroup.add(coneMesh);
                    // Runic Temple or Crystal
                    if (blockW * blockD > 25 && Math.random() > 0.3) {
                        const templeGeo = new THREE.BoxGeometry(2.0, 2.5, 2.0);
                        const temple = new THREE.Mesh(templeGeo, stoneMat);
                        temple.position.set(0, blockH / 2 + 1.25, 0);
                        
                        const roofGeo = new THREE.ConeGeometry(1.8, 1.5, 4);
                        const roof = new THREE.Mesh(roofGeo, stoneMat);
                        roof.position.set(0, 1.25 + 0.75, 0);
                        roof.rotation.y = Math.PI / 4;
                        temple.add(roof);

                        const runeDecal = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 2.1), runeMat);
                        temple.add(runeDecal);

                        temple.castShadow = true;
                        temple.receiveShadow = true;
                        structureGroup.add(temple);
                    } else if (Math.random() > 0.5) {
                        // Crystal
                        const coreGeo = new THREE.OctahedronGeometry(0.18 + Math.random() * 0.08, 0);
                        const core = new THREE.Mesh(coreGeo, runeMat);
                        core.position.set(0, blockH / 2 + 0.2, 0);
                        structureGroup.add(core);
                    }

                } else if (islandType === 1) {
                    // TYPE 1: PILLAR CLUSTER (Basalt-like columns)
                    const numPillars = 3 + Math.floor(Math.random() * 4);
                    for (let p = 0; p < numPillars; p++) {
                        const pw = (0.8 + Math.random() * 1.0) * 1.4;
                        const ph = (4.0 + Math.random() * 6.0) * 1.4;
                        
                        const pillarGeo = new THREE.CylinderGeometry(pw, pw * 0.7, ph, 6);
                        const pillar = new THREE.Mesh(pillarGeo, stoneMat);
                        
                        const px = (Math.random() - 0.5) * 3.0;
                        const pz = (Math.random() - 0.5) * 3.0;
                        const py = (Math.random() - 0.5) * 2.0;
                        
                        pillar.position.set(px, py, pz);
                        pillar.rotation.x = (Math.random() - 0.5) * 0.2;
                        pillar.rotation.z = (Math.random() - 0.5) * 0.2;
                        structureGroup.add(pillar);
                        
                        // Top cap for pillar
                        const pCapGeo = new THREE.CylinderGeometry(pw + 0.05, pw + 0.05, 0.2, 6);
                        const pCap = new THREE.Mesh(pCapGeo, capMat);
                        pCap.position.set(px, py + ph / 2 + 0.1, pz);
                        pCap.rotation.copy(pillar.rotation);
                        structureGroup.add(pCap);
                    }

                } else {
                    // TYPE 2: RUINS (Flat circular island with standing stones)
                    const radius = (2.5 + Math.random() * 2.0) * 1.4;
                    const thickness = (0.8 + Math.random() * 1.0) * 1.4;
                    
                    const baseGeo = new THREE.CylinderGeometry(radius, radius * 0.5, thickness, 8);
                    const base = new THREE.Mesh(baseGeo, stoneMat);
                    structureGroup.add(base);
                    
                    const capGeo = new THREE.CylinderGeometry(radius + 0.1, radius + 0.1, 0.15, 8);
                    const cap = new THREE.Mesh(capGeo, capMat);
                    cap.position.y = thickness / 2 + 0.055;
                    structureGroup.add(cap);

                    // Centerpiece (Hexagonal Temple)
                    if (radius > 4.5 && Math.random() > 0.3) {
                        const templeGeo = new THREE.CylinderGeometry(1.5, 1.5, 3.0, 6);
                        const temple = new THREE.Mesh(templeGeo, stoneMat);
                        temple.position.set(0, thickness / 2 + 1.5, 0);
                        
                        const roofGeo = new THREE.ConeGeometry(2.0, 2.0, 6);
                        const roof = new THREE.Mesh(roofGeo, stoneMat);
                        roof.position.set(0, 1.5 + 1.0, 0);
                        temple.add(roof);

                        const runeDecal = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.5, 6), runeMat);
                        temple.add(runeDecal);

                        temple.castShadow = true;
                        temple.receiveShadow = true;
                        structureGroup.add(temple);
                    }
                    
                    // Standing stones (arch or monoliths)
                    const numStones = 2 + Math.floor(Math.random() * 4);
                    for (let s = 0; s < numStones; s++) {
                        const sw = 0.4 + Math.random() * 0.3;
                        const sh = 1.0 + Math.random() * 2.0;
                        const sd = 0.4 + Math.random() * 0.3;
                        
                        const stoneGeo = new THREE.BoxGeometry(sw, sh, sd);
                        const stone = new THREE.Mesh(stoneGeo, stoneMat);
                        
                        const angle = (s / numStones) * Math.PI * 2 + Math.random();
                        const dist = radius * 0.6;
                        
                        stone.position.set(Math.cos(angle) * dist, thickness / 2 + sh / 2, Math.sin(angle) * dist);
                        stone.rotation.y = -angle; // Face outward
                        
                        // Small glowing rune on the stone
                        const runeGeo = new THREE.BoxGeometry(sw * 1.1, sh * 0.3, sd * 1.1);
                        const rune = new THREE.Mesh(runeGeo, runeMat);
                        rune.position.copy(stone.position);
                        structureGroup.add(rune);
                        
                        structureGroup.add(stone);
                    }
                }

                // Add satellite shards and vines to ALL types
                const shardCount = Math.floor(Math.random() * 3);
                for (let s = 0; s < shardCount; s++) {
                    const shardGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
                    const shard = new THREE.Mesh(shardGeo, stoneMat);
                    const angle = Math.random() * Math.PI * 2;
                    const dist = 3.0 + Math.random() * 3.0;
                    shard.position.set(Math.cos(angle) * dist, (Math.random() - 0.5) * 2.0, Math.sin(angle) * dist);
                    shard.rotation.set(Math.random(), Math.random(), Math.random());
                    structureGroup.add(shard);
                }

                const vineCount = Math.floor(Math.random() * 4);
                for (let v = 0; v < vineCount; v++) {
                    const vineH = 1.0 + Math.random() * 2.0;
                    const vineGeo = new THREE.CylinderGeometry(0.03, 0.015, vineH, 4);
                    const vine = new THREE.Mesh(vineGeo, vineMat);
                    vine.position.set((Math.random() - 0.5) * 2.0, -vineH / 2 - 0.5, (Math.random() - 0.5) * 2.0);
                    vine.rotation.z = (Math.random() - 0.5) * 0.3;
                    vine.rotation.x = (Math.random() - 0.5) * 0.3;
                    structureGroup.add(vine);
                }

                // Enable shadows for all parts
                structureGroup.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                this.levelMeshGroup.add(structureGroup);
                
                // Keep track of them for hovering animation & bridges
                if (!this.floatingIslands) this.floatingIslands = [];
                this.floatingIslands.push({
                    mesh: structureGroup,
                    baseY: posY,
                    speed: 0.2 + Math.random() * 0.5,
                    offset: Math.random() * Math.PI * 2,
                    connections: 0 // Bridge connections counter
                });
            }

            // --- Bridge Generation System ---
            if (this.floatingIslands && this.floatingIslands.length > 0) {
                const woodMat = new THREE.MeshLambertMaterial({ color: 0x5c4033 });
                const stoneMatBridge = new THREE.MeshLambertMaterial({ color: 0x6a6a6a });
                const vineMatBridge = new THREE.MeshLambertMaterial({ color: 0x2e5c2e });

                for (let i = 0; i < this.floatingIslands.length; i++) {
                    const islA = this.floatingIslands[i];
                    
                    for (let j = i + 1; j < this.floatingIslands.length; j++) {
                        if (islA.connections >= 2) break;
                        
                        const islB = this.floatingIslands[j];
                        if (islB.connections >= 2) continue;
                        
                        const dx = islA.mesh.position.x - islB.mesh.position.x;
                        const dy = islA.mesh.position.y - islB.mesh.position.y;
                        const dz = islA.mesh.position.z - islB.mesh.position.z;
                        
                        const horizDist = Math.sqrt(dx * dx + dz * dz);
                        const dist3D = Math.sqrt(dx * dx + dy * dy + dz * dz);
                        
                        // Valid bridge connection?
                        if (horizDist > 4.0 && horizDist < 20.0 && Math.abs(dy) < 6.0) {
                            const bridgeGroup = new THREE.Group();
                            
                            const midX = (islA.mesh.position.x + islB.mesh.position.x) / 2;
                            const midY = (islA.mesh.position.y + islB.mesh.position.y) / 2;
                            const midZ = (islA.mesh.position.z + islB.mesh.position.z) / 2;
                            bridgeGroup.position.set(midX, midY, midZ);
                            bridgeGroup.lookAt(islB.mesh.position.x, islB.mesh.position.y, islB.mesh.position.z);
                            
                            const connType = Math.floor(Math.random() * 3);

                            if (connType === 0) {
                                // Type 0: Wood Bridge
                                const numPlanks = Math.floor(dist3D / 0.8);
                                for (let p = 0; p < numPlanks; p++) {
                                    const t = p / (numPlanks - 1);
                                    const sag = Math.sin(t * Math.PI) * (dist3D * 0.15); // Sag curve
                                    
                                    const plankGeo = new THREE.BoxGeometry(1.5, 0.15, 0.5);
                                    const plank = new THREE.Mesh(plankGeo, woodMat);
                                    
                                    const zPos = (t - 0.5) * dist3D;
                                    plank.position.set(0, -sag, zPos);
                                    
                                    plank.rotation.z = (Math.random() - 0.5) * 0.2;
                                    plank.rotation.x = (Math.random() - 0.5) * 0.2;
                                    
                                    plank.castShadow = true;
                                    plank.receiveShadow = true;
                                    bridgeGroup.add(plank);
                                }
                            } else if (connType === 1) {
                                // Type 1: Stone Arch
                                const numStones = Math.floor(dist3D / 1.2);
                                for (let p = 0; p < numStones; p++) {
                                    const t = p / (numStones - 1);
                                    const arch = Math.sin(t * Math.PI) * (dist3D * 0.2); // Arch goes UP
                                    
                                    const stoneGeo = new THREE.BoxGeometry(2.0, 0.8, 1.2);
                                    const stone = new THREE.Mesh(stoneGeo, stoneMatBridge);
                                    
                                    const zPos = (t - 0.5) * dist3D;
                                    stone.position.set(0, arch, zPos);
                                    
                                    stone.rotation.x = -(t - 0.5) * Math.PI * 0.5; // Rotate to follow arch
                                    stone.rotation.y = (Math.random() - 0.5) * 0.1;
                                    stone.rotation.z = (Math.random() - 0.5) * 0.1;
                                    
                                    stone.castShadow = true;
                                    stone.receiveShadow = true;
                                    bridgeGroup.add(stone);
                                }
                            } else {
                                // Type 2: Giant Vines / Roots
                                const numVines = 2 + Math.floor(Math.random() * 2);
                                for (let v = 0; v < numVines; v++) {
                                    const numSegments = Math.floor(dist3D / 1.5);
                                    const vineRadius = 0.2 + Math.random() * 0.3;
                                    const vineOffset = (Math.random() - 0.5) * 1.5;
                                    
                                    for (let s = 0; s < numSegments; s++) {
                                        const t = s / (numSegments - 1);
                                        const sag = Math.sin(t * Math.PI) * (dist3D * 0.2) + (Math.random() - 0.5) * 0.5;
                                        
                                        const segGeo = new THREE.CylinderGeometry(vineRadius, vineRadius * 0.8, 1.8, 5);
                                        const segment = new THREE.Mesh(segGeo, vineMatBridge);
                                        
                                        const zPos = (t - 0.5) * dist3D;
                                        const xPos = Math.sin(t * Math.PI * 4 + v) * 0.8 + vineOffset; // Twist around center
                                        
                                        segment.position.set(xPos, -sag, zPos);
                                        segment.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
                                        segment.rotation.z = (Math.random() - 0.5) * 0.5;
                                        
                                        segment.castShadow = true;
                                        segment.receiveShadow = true;
                                        bridgeGroup.add(segment);
                                    }
                                }
                            }
                            
                            this.levelMeshGroup.add(bridgeGroup);
                            
                            // Synchronize island movement if hovering is ever enabled
                            islB.speed = islA.speed;
                            islB.offset = islA.offset;
                            
                            islA.connections++;
                            islB.connections++;
                        }
                    }
                }
            }
        }
    }
    createSkybox() {
        const skyGeo = new THREE.SphereGeometry(500, 32, 32);

        const size = 2048; // High resolution skybox
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const themeName = this.themeManager.getThemeName(this.currentLevelIndex);
        let topColor, bottomColor;

        if (themeName === 'Enchanted Forest') {
            topColor = '#101030'; // Night sky
            bottomColor = '#2a1a4a'; // Magical purple horizon
        } else if (themeName === 'Medieval City') {
            topColor = '#1a2a6c'; // Deep Blue
            bottomColor = '#b21f1f'; // Sunset Red
        } else if (themeName === 'Deep Cave') {
            topColor = '#000000';
            bottomColor = '#050510'; // Very dark fog
        } else { // Demonic Base
            topColor = '#110000';
            bottomColor = '#330000'; // Hellish Red
        }

        // Base gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, size);
        gradient.addColorStop(0, topColor);
        gradient.addColorStop(1, bottomColor);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        // Global Stars
        if (themeName !== 'Deep Cave') {
            for (let i = 0; i < 1500; i++) {
                const x = Math.random() * size;
                const y = Math.random() * size;
                const r = Math.random() * 1.5;
                ctx.fillStyle = `rgba(255, 255, 255, ${Math.random()})`;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Theme-specific effects
        if (themeName === 'Enchanted Forest') {
            // Magical Nebulas
            for (let i = 0; i < 15; i++) {
                const x = Math.random() * size;
                const y = Math.random() * size; // Spread everywhere
                const r = 200 + Math.random() * 300;

                const cloudGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
                const hue = Math.random() > 0.5 ? '280, 100%, 70%' : '200, 100%, 70%';
                cloudGrad.addColorStop(0, `hsla(${hue}, 0.15)`);
                cloudGrad.addColorStop(1, `hsla(${hue}, 0)`);
                ctx.fillStyle = cloudGrad;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Giant Magical Moon
            const moonX = size * 0.7;
            const moonY = size * 0.3;
            const moonR = 150;
            const moonGrad = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, moonR * 2);
            moonGrad.addColorStop(0, 'rgba(200, 240, 255, 1)');
            moonGrad.addColorStop(0.2, 'rgba(200, 240, 255, 0.8)');
            moonGrad.addColorStop(1, 'rgba(200, 240, 255, 0)');
            ctx.fillStyle = moonGrad;
            ctx.beginPath();
            ctx.arc(moonX, moonY, moonR * 2, 0, Math.PI * 2);
            ctx.fill();

            // Pollen / Magic motes
            ctx.fillStyle = '#ffffaa';
            for (let i = 0; i < 800; i++) {
                const x = Math.random() * size;
                const y = Math.random() * size;
                const s = Math.random() * 3;
                ctx.globalAlpha = Math.random() * 0.6 + 0.4;
                ctx.beginPath();
                ctx.arc(x, y, s, 0, Math.PI * 2);
                ctx.fill();
            }

        } else if (themeName === 'Medieval City') {
            // Huge Setting Sun
            const sunX = size * 0.5;
            const sunY = size * 0.7; // Lower on horizon
            const sunR = 250;
            const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 3);
            sunGrad.addColorStop(0, 'rgba(255, 200, 50, 1)');
            sunGrad.addColorStop(0.1, 'rgba(255, 100, 0, 0.8)');
            sunGrad.addColorStop(1, 'rgba(255, 0, 0, 0)');
            ctx.fillStyle = sunGrad;
            ctx.beginPath();
            ctx.arc(sunX, sunY, sunR * 3, 0, Math.PI * 2);
            ctx.fill();

        } else if (themeName === 'Deep Cave') {
            // Glowing crystals in the dark void
            for (let i = 0; i < 200; i++) {
                const x = Math.random() * size;
                const y = Math.random() * size;
                const s = Math.random() * 4;

                const glowColor = Math.random() > 0.5 ? 'rgba(100, 150, 255, 0.6)' : 'rgba(150, 50, 255, 0.6)';
                ctx.fillStyle = glowColor;
                ctx.beginPath();
                ctx.arc(x, y, s, 0, Math.PI * 2);
                ctx.fill();
                
                // Crystal flare
                ctx.fillStyle = 'rgba(255,255,255,0.8)';
                ctx.fillRect(x - s/4, y - s*2, s/2, s*4);
                ctx.fillRect(x - s*2, y - s/4, s*4, s/2);
            }

        } else { // Demonic Base
            // Giant Blood Moon / Eye
            const eyeX = size * 0.5;
            const eyeY = size * 0.3;
            const eyeR = 200;
            const eyeGrad = ctx.createRadialGradient(eyeX, eyeY, 0, eyeX, eyeY, eyeR * 2.5);
            eyeGrad.addColorStop(0, 'rgba(255, 50, 0, 1)');
            eyeGrad.addColorStop(0.3, 'rgba(150, 0, 0, 0.8)');
            eyeGrad.addColorStop(1, 'rgba(50, 0, 0, 0)');
            ctx.fillStyle = eyeGrad;
            ctx.beginPath();
            ctx.arc(eyeX, eyeY, eyeR * 2.5, 0, Math.PI * 2);
            ctx.fill();

            // Raining Embers/Ash
            for (let i = 0; i < 1000; i++) {
                const x = Math.random() * size;
                const y = Math.random() * size;
                const s = Math.random() * 4 + 1;
                ctx.fillStyle = Math.random() > 0.3 ? 'rgba(255, 100, 0, 0.8)' : 'rgba(50, 50, 50, 0.8)';
                ctx.beginPath();
                ctx.arc(x, y, s, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;

        const skyTexture = new THREE.CanvasTexture(canvas);
        const skyMat = new THREE.MeshBasicMaterial({
            map: skyTexture,
            side: THREE.BackSide,
            fog: false // Sky shouldn't be affected by fog
        });

        const sky = new THREE.Mesh(skyGeo, skyMat);
        sky.position.set(
            (this.width * this.cellSize) / 2,
            0,
            (this.height * this.cellSize) / 2
        );
        this.levelMeshGroup.add(sky);
    }

    addDecorations(rooms, startPos) {
        this.decorationPositions = []; // Reset decoration tracking

        rooms.forEach(room => {
            // Get themed decorations for this room
            const roomDecorations = this.themeManager.generateRoomDecorations(
                room,
                startPos,
                this.currentLevelIndex
            );

            // Spawn each decoration
            // Spawn each decoration - DISABLED per user request
            // (Code removed during cleanup)

            // Add themed point light in center of some rooms
            if (Math.random() < 0.4) {
                const cx = Math.floor(room.x + room.w / 2);
                const cz = Math.floor(room.z + room.h / 2);

                const lightColor = this.themeManager.getPointLightColor(this.currentLevelIndex);
                const light = new THREE.PointLight(lightColor, 1, 10);
                light.position.set(
                    cx * this.cellSize + this.cellSize / 2,
                    2,
                    cz * this.cellSize + this.cellSize / 2
                );
                this.levelMeshGroup.add(light);
            }
        });
    }

    addMeshAt(geo, mat, x, z, y) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(
            x * this.cellSize + this.cellSize / 2,
            y,
            z * this.cellSize + this.cellSize / 2
        );
        this.levelMeshGroup.add(mesh);
    }

    isWall(x, z) {
        const gridX = Math.floor(x / this.cellSize);
        const gridZ = Math.floor(z / this.cellSize);

        if (gridX < 0 || gridX >= this.width || gridZ < 0 || gridZ >= this.height) {
            return true; // Out of bounds = wall
        }

        const index = gridZ * this.width + gridX;
        return this.data[index] === 1;
    }

    getRandomEmptyPosition() {
        let attempts = 0;
        while (attempts < 100) {
            attempts++;
            const x = Math.floor(Math.random() * this.width);
            const z = Math.floor(Math.random() * this.height);
            const index = z * this.width + x;

            if (this.data[index] === 0) {
                return { x, z };
            }
        }
        return null;
    }

    isDecoration(x, z) {
        const gridX = Math.floor(x / this.cellSize);
        const gridZ = Math.floor(z / this.cellSize);

        for (const deco of this.decorationPositions) {
            if (deco.x === gridX && deco.z === gridZ) {
                return true;
            }
        }
        return false;
    }

    getRoomTypeForWall(x, z) {
        if (!this.levelData || !this.levelData.rooms) return null;

        // Check 8 neighbors for adjacent floor cells of special rooms
        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                const nz = z + dz;
                if (nx >= 0 && nx < this.width && nz >= 0 && nz < this.height) {
                    const idx = nz * this.width + nx;
                    if (this.data[idx] === 0) {
                        for (const room of this.levelData.rooms) {
                            if (nx >= room.x && nx < room.x + room.w &&
                                nz >= room.z && nz < room.z + room.h) {
                                if (room.type === 'event' || room.type === 'treasure') {
                                    return room.type;
                                }
                            }
                        }
                    }
                }
            }
        }
        return null;
    }
}
