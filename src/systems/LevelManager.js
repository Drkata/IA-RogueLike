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

        // Generate Chest Positions (2-3 per level, excluding Arena)
        this.chestPositions = [];
        if (levelIndex % 10 !== 0 && levelData.rooms) {
            const roomCount = levelData.rooms.length;
            if (roomCount > 1) {
                const numChests = Math.floor(Math.random() * 2) + 2; // 2 or 3
                // Shuffle rooms (excluding first/safe room)
                const availableRooms = levelData.rooms.slice(1).sort(() => 0.5 - Math.random());

                for (let i = 0; i < Math.min(numChests, availableRooms.length); i++) {
                    const room = availableRooms[i];
                    // Pick a random corner
                    const corners = [
                        { x: room.x + 1, z: room.z + 1 },
                        { x: room.x + room.w - 2, z: room.z + 1 },
                        { x: room.x + 1, z: room.z + room.h - 2 },
                        { x: room.x + room.w - 2, z: room.z + room.h - 2 }
                    ];
                    const corner = corners[Math.floor(Math.random() * corners.length)];
                    this.chestPositions.push(corner);
                }
            }
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
            const floorColor2Hex = '#' + (floorColor + 0x111111).toString(16).padStart(6, '0');
            floorTex = TextureGenerator.createGridTexture(floorColorHex, floorColor2Hex);
        }

        return {
            walls: wallMaterials, // Array of materials for variation
            floor: new THREE.MeshStandardMaterial({
                map: floorTex,
                roughness: 0.8,
                metalness: 0.2
            })
        };
    }

    buildLevel() {
        // Clear previous level
        this.levelMeshGroup.clear();

        const mats = this.getThemeMaterials();
        const wallGeo = new THREE.BoxGeometry(this.cellSize, CONSTANTS.WALL_HEIGHT, this.cellSize);

        // Prepare instance data
        const wallInstances = mats.walls.map(() => []);

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const index = y * this.width + x;
                if (this.data[index] === 1) {
                    // Pick random wall material index
                    const matIndex = Math.floor(Math.random() * mats.walls.length);

                    const posX = x * this.cellSize + this.cellSize / 2;
                    const posY = CONSTANTS.WALL_HEIGHT / 2;
                    const posZ = y * this.cellSize + this.cellSize / 2;

                    const dummy = new THREE.Object3D();
                    dummy.position.set(posX, posY, posZ);
                    dummy.updateMatrix();

                    wallInstances[matIndex].push(dummy.matrix.clone());
                }
            }
        }

        // Create InstancedMeshes
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

        // Floor
        const floorGeo = new THREE.PlaneGeometry(this.width * this.cellSize, this.height * this.cellSize);
        const floor = new THREE.Mesh(floorGeo, mats.floor);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(
            (this.width * this.cellSize) / 2 - this.cellSize / 2,
            0,
            (this.height * this.cellSize) / 2 - this.cellSize / 2
        );
        floor.receiveShadow = true;
        this.levelMeshGroup.add(floor);

        // Skybox
        this.createSkybox();

        // Decorations
        if (this.levelData.rooms) {
            this.addDecorations(this.levelData.rooms, this.levelData.playerStart);
        }
    }

    createSkybox() {
        const skyGeo = new THREE.SphereGeometry(500, 32, 32);

        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        const themeName = this.themeManager.getThemeName(this.currentLevelIndex);
        let topColor, bottomColor;

        if (themeName === 'Enchanted Forest') {
            topColor = '#4a90e2'; // Bright Blue Sky
            bottomColor = '#87ceeb'; // Light Blue Horizon
        } else if (themeName === 'Medieval City') {
            topColor = '#1a2a6c'; // Deep Blue
            bottomColor = '#b21f1f'; // Sunset Red
        } else if (themeName === 'Deep Cave') {
            topColor = '#000000';
            bottomColor = '#050510'; // Very dark fog
        } else { // Demonic Base
            topColor = '#110000';
            bottomColor = '#220505'; // Hellish Red
        }

        // Base gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, 1024);
        gradient.addColorStop(0, topColor);
        gradient.addColorStop(1, bottomColor);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1024, 1024);

        // Theme-specific effects
        if (themeName === 'Enchanted Forest') {
            // Clouds
            for (let i = 0; i < 20; i++) {
                const x = Math.random() * 1024;
                const y = Math.random() * 400; // Upper sky
                const size = 50 + Math.random() * 100;

                const cloudGrad = ctx.createRadialGradient(x, y, 0, x, y, size);
                cloudGrad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
                cloudGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = cloudGrad;
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
            }

            // Pollen / Magic motes
            ctx.fillStyle = '#ffffaa';
            for (let i = 0; i < 200; i++) {
                const x = Math.random() * 1024;
                const y = Math.random() * 1024;
                const size = Math.random() * 2;
                ctx.globalAlpha = Math.random() * 0.5 + 0.5;
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
            }

        } else if (themeName === 'Medieval City') {
            // Sunset / Stars mixing
            ctx.fillStyle = '#ffffff';
            for (let i = 0; i < 100; i++) {
                const x = Math.random() * 1024;
                const y = Math.random() * 400; // Top only
                const size = Math.random();
                ctx.globalAlpha = Math.random();
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
            }

        } else if (themeName === 'Deep Cave') {
            // Stalactites silhouettes? Or just darkness
            // Maybe glowing crystals on ceiling
            for (let i = 0; i < 50; i++) {
                const x = Math.random() * 1024;
                const y = Math.random() * 1024;
                const size = Math.random() * 3;

                // Purple/Blue glow
                const glowColor = Math.random() > 0.5 ? 'rgba(100, 100, 255, 0.5)' : 'rgba(200, 50, 255, 0.5)';
                ctx.fillStyle = glowColor;
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
            }

        } else { // Demonic Base
            // Red Haze/Ash
            for (let i = 0; i < 40; i++) {
                const x = Math.random() * 1024;
                const y = Math.random() * 1024;
                const size = 80 + Math.random() * 150;

                const ashGrad = ctx.createRadialGradient(x, y, 0, x, y, size);
                ashGrad.addColorStop(0, 'rgba(100, 20, 0, 0.2)');
                ashGrad.addColorStop(1, 'rgba(100, 20, 0, 0)');
                ctx.fillStyle = ashGrad;
                ctx.fillRect(x - size, y - size, size * 2, size * 2);
            }

            // Embers
            ctx.fillStyle = '#ffaa00';
            for (let i = 0; i < 300; i++) {
                const x = Math.random() * 1024;
                const y = Math.random() * 1024;
                const size = Math.random() * 2;
                ctx.globalAlpha = Math.random();
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
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
}
