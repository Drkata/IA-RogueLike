import * as THREE from 'three';

export const LabTheme = {
    name: 'Lab',

    // Color palette
    wallColors: [
        0xdddddd, // Light gray
        0xccddee, // Light blue-gray
        0xeeeeff  // Very light blue
    ],

    wallTextureType: 'panel',
    floorTextureType: 'hexagon',

    floorColor: 0xcccccc,
    ceilingColor: 0xffffff,

    // Lighting
    ambientLight: { color: 0xccddff, intensity: 0.5 },
    pointLightColor: 0x00ddff,

    // Decorations
    decorations: [
        {
            name: 'holographic_terminal',
            create: () => {
                const group = new THREE.Group();

                // Base console
                const baseGeo = new THREE.BoxGeometry(0.7, 0.8, 0.5);
                const baseMat = new THREE.MeshStandardMaterial({
                    color: 0xdddddd,
                    metalness: 0.4,
                    roughness: 0.3
                });
                const base = new THREE.Mesh(baseGeo, baseMat);
                base.position.y = 0.4;
                group.add(base);

                // Holographic screen
                const screenGeo = new THREE.BoxGeometry(0.6, 0.5, 0.02);
                const screenMat = new THREE.MeshStandardMaterial({
                    color: 0x00ffff,
                    transparent: true,
                    opacity: 0.6,
                    emissive: 0x00aaaa,
                    emissiveIntensity: 0.8
                });
                const screen = new THREE.Mesh(screenGeo, screenMat);
                screen.position.set(0, 0.8, 0.1);
                screen.rotation.x = -0.2;
                group.add(screen);

                // Scan lines
                for (let i = 0; i < 5; i++) {
                    const lineGeo = new THREE.BoxGeometry(0.6, 0.02, 0.01);
                    const lineMat = new THREE.MeshStandardMaterial({
                        color: 0x00ffff,
                        emissive: 0x00ffff,
                        emissiveIntensity: 1
                    });
                    const line = new THREE.Mesh(lineGeo, lineMat);
                    line.position.set(0, 0.6 + i * 0.1, 0.11);
                    line.rotation.x = -0.2;
                    group.add(line);
                }

                // Status LEDs
                const colors = [0x00ff00, 0x00ff00, 0xffff00, 0xff0000];
                for (let i = 0; i < 4; i++) {
                    const ledGeo = new THREE.SphereGeometry(0.03, 8, 8);
                    const ledMat = new THREE.MeshStandardMaterial({
                        color: colors[i],
                        emissive: colors[i],
                        emissiveIntensity: 0.9
                    });
                    const led = new THREE.Mesh(ledGeo, ledMat);
                    led.position.set(-0.25 + i * 0.15, 0.3, 0.26);
                    group.add(led);
                }

                return { mesh: group, height: 0.5 };
            },
            spawnChance: 0.35,
            minPerRoom: 0,
            maxPerRoom: 2,
            wallOnly: true
        },
        {
            name: 'research_table',
            create: () => {
                const group = new THREE.Group();

                // Table
                const geo = new THREE.BoxGeometry(1.2, 0.8, 0.6);
                const mat = new THREE.MeshStandardMaterial({
                    color: 0xffffff,
                    metalness: 0.3,
                    roughness: 0.2
                });
                const table = new THREE.Mesh(geo, mat);
                group.add(table);

                // Glowing edge strips
                const stripGeo = new THREE.BoxGeometry(1.21, 0.05, 0.61);
                const stripMat = new THREE.MeshStandardMaterial({
                    color: 0x00ddff,
                    emissive: 0x0088aa,
                    emissiveIntensity: 0.6
                });
                const strip1 = new THREE.Mesh(stripGeo, stripMat);
                strip1.position.y = 0.4;
                const strip2 = new THREE.Mesh(stripGeo, stripMat);
                strip2.position.y = -0.4;
                group.add(strip1, strip2);

                // Sample containers
                for (let i = 0; i < 3; i++) {
                    const containerGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.2, 8);
                    const containerMat = new THREE.MeshStandardMaterial({
                        color: 0xaaffff,
                        transparent: true,
                        opacity: 0.7,
                        emissive: 0x0066aa,
                        emissiveIntensity: 0.4
                    });
                    const container = new THREE.Mesh(containerGeo, containerMat);
                    container.position.set(-0.4 + i * 0.4, 0.5, 0);
                    group.add(container);
                }

                return { mesh: group, height: 0.4 };
            },
            spawnChance: 0.3,
            minPerRoom: 0,
            maxPerRoom: 2
        },
        {
            name: 'energy_pod',
            create: () => {
                const group = new THREE.Group();

                // Pod cylinder
                const geo = new THREE.CylinderGeometry(0.4, 0.4, 2, 16);
                const mat = new THREE.MeshStandardMaterial({
                    color: 0x88ffff,
                    transparent: true,
                    opacity: 0.3,
                    metalness: 0.9,
                    roughness: 0.1
                });
                const pod = new THREE.Mesh(geo, mat);
                group.add(pod);

                // Energy core
                const coreGeo = new THREE.SphereGeometry(0.15, 16, 16);
                const coreMat = new THREE.MeshStandardMaterial({
                    color: 0x00ffff,
                    emissive: 0x00ffff,
                    emissiveIntensity: 1
                });
                const core = new THREE.Mesh(coreGeo, coreMat);
                group.add(core);

                // Particle rings
                for (let i = 0; i < 3; i++) {
                    const ringGeo = new THREE.TorusGeometry(0.25 + i * 0.1, 0.02, 8, 16);
                    const ringMat = new THREE.MeshStandardMaterial({
                        color: 0x00aaff,
                        emissive: 0x0088ff,
                        emissiveIntensity: 0.7
                    });
                    const ring = new THREE.Mesh(ringGeo, ringMat);
                    ring.rotation.x = Math.PI / 2 + i * 0.3;
                    ring.position.y = Math.sin(i) * 0.2;
                    group.add(ring);
                }

                return { mesh: group, height: 1 };
            },
            spawnChance: 0.2,
            minPerRoom: 0,
            maxPerRoom: 1
        },
        {
            name: 'data_server',
            create: () => {
                const group = new THREE.Group();

                // Server rack
                const geo = new THREE.BoxGeometry(0.6, 2, 0.4);
                const mat = new THREE.MeshStandardMaterial({
                    color: 0x2a2a2a,
                    metalness: 0.8,
                    roughness: 0.2
                });
                const server = new THREE.Mesh(geo, mat);
                group.add(server);

                // Blinking LEDs (multiple rows)
                for (let row = 0; row < 8; row++) {
                    for (let col = 0; col < 4; col++) {
                        const ledGeo = new THREE.SphereGeometry(0.02, 6, 6);
                        const isActive = Math.random() > 0.3;
                        const ledMat = new THREE.MeshStandardMaterial({
                            color: isActive ? 0x00ff00 : 0x003300,
                            emissive: isActive ? 0x00ff00 : 0x000000,
                            emissiveIntensity: isActive ? 0.8 : 0
                        });
                        const led = new THREE.Mesh(ledGeo, ledMat);
                        led.position.set(
                            -0.2 + col * 0.13,
                            -0.8 + row * 0.2,
                            0.21
                        );
                        group.add(led);
                    }
                }

                // Vent slits
                for (let i = 0; i < 10; i++) {
                    const slitGeo = new THREE.BoxGeometry(0.5, 0.02, 0.01);
                    const slitMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
                    const slit = new THREE.Mesh(slitGeo, slitMat);
                    slit.position.set(0, -0.9 + i * 0.18, 0.21);
                    group.add(slit);
                }

                return { mesh: group, height: 1 };
            },
            spawnChance: 0.25,
            minPerRoom: 0,
            maxPerRoom: 2,
            wallOnly: true
        },
        {
            name: 'plasma_pillar',
            create: () => {
                const group = new THREE.Group();

                // Glass cylinder
                const geo = new THREE.CylinderGeometry(0.2, 0.2, 3, 16);
                const mat = new THREE.MeshStandardMaterial({
                    color: 0xaaffff,
                    transparent: true,
                    opacity: 0.4,
                    metalness: 0.9,
                    roughness: 0.1
                });
                const pillar = new THREE.Mesh(geo, mat);
                group.add(pillar);

                // Plasma core
                const coreGeo = new THREE.CylinderGeometry(0.1, 0.1, 2.8, 8);
                const coreMat = new THREE.MeshStandardMaterial({
                    color: 0x00ffff,
                    emissive: 0x00aaff,
                    emissiveIntensity: 1
                });
                const core = new THREE.Mesh(coreGeo, coreMat);
                group.add(core);

                // Energy bands
                for (let i = 0; i < 5; i++) {
                    const bandGeo = new THREE.TorusGeometry(0.22, 0.03, 8, 16);
                    const bandMat = new THREE.MeshStandardMaterial({
                        color: 0x00ffff,
                        emissive: 0x00ffff,
                        emissiveIntensity: 0.9
                    });
                    const band = new THREE.Mesh(bandGeo, bandMat);
                    band.position.y = -1.2 + i * 0.6;
                    band.rotation.x = Math.PI / 2;
                    group.add(band);
                }

                return { mesh: group, height: 1.5 };
            },
            spawnChance: 0.2,
            minPerRoom: 0,
            maxPerRoom: 2,
            cornerOnly: true
        },
        {
            name: 'medical_station',
            create: () => {
                const group = new THREE.Group();

                // Cabinet
                const geo = new THREE.BoxGeometry(0.5, 1.5, 0.3);
                const mat = new THREE.MeshStandardMaterial({
                    color: 0xffffff,
                    metalness: 0.3,
                    roughness: 0.3
                });
                const cabinet = new THREE.Mesh(geo, mat);
                group.add(cabinet);

                // Red cross
                const crossGeo1 = new THREE.BoxGeometry(0.3, 0.1, 0.01);
                const crossGeo2 = new THREE.BoxGeometry(0.1, 0.3, 0.01);
                const crossMat = new THREE.MeshStandardMaterial({
                    color: 0xff0000,
                    emissive: 0xff0000,
                    emissiveIntensity: 0.3
                });
                const cross1 = new THREE.Mesh(crossGeo1, crossMat);
                cross1.position.set(0, 0.5, 0.16);
                const cross2 = new THREE.Mesh(crossGeo2, crossMat);
                cross2.position.set(0, 0.5, 0.16);
                group.add(cross1, cross2);

                // Status light
                const lightGeo = new THREE.SphereGeometry(0.04, 8, 8);
                const lightMat = new THREE.MeshStandardMaterial({
                    color: 0x00ff00,
                    emissive: 0x00ff00,
                    emissiveIntensity: 0.9
                });
                const light = new THREE.Mesh(lightGeo, lightMat);
                light.position.set(0.15, 0.7, 0.16);
                group.add(light);

                return { mesh: group, height: 0.75 };
            },
            spawnChance: 0.2,
            minPerRoom: 0,
            maxPerRoom: 1,
            wallOnly: true
        }
    ]
};
