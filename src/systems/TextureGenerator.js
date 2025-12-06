import * as THREE from 'three';

export class TextureGenerator {
    static createGridTexture(color1, color2) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = color1;
        ctx.fillRect(0, 0, size, size);

        // Grid
        ctx.fillStyle = color2;
        const gridSize = 64;
        for (let x = 0; x < size; x += gridSize) {
            ctx.fillRect(x, 0, 2, size);
        }
        for (let y = 0; y < size; y += gridSize) {
            ctx.fillRect(0, y, size, 2);
        }

        // Border
        ctx.lineWidth = 10;
        ctx.strokeStyle = color2;
        ctx.strokeRect(0, 0, size, size);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter; // Retro look
        return texture;
    }

    static createNoiseTexture(baseColorHex) {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Base color
        ctx.fillStyle = baseColorHex;
        ctx.fillRect(0, 0, size, size);

        // Noise
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * 30;
            data[i] = Math.max(0, Math.min(255, data[i] + noise));     // R
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise)); // G
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise)); // B
            // Alpha unchanged
        }

        ctx.putImageData(imageData, 0, 0);

        // Add some grunge/dirt
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        for (let i = 0; i < 20; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const w = Math.random() * 50 + 10;
            const h = Math.random() * 50 + 10;
            ctx.fillRect(x, y, w, h);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        return texture;
    }

    static createBricksTexture(color) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#333'; // Mortar
        ctx.fillRect(0, 0, size, size);

        ctx.fillStyle = color;
        const brickW = 64;
        const brickH = 32;

        for (let y = 0; y < size; y += brickH + 4) {
            const offset = (y / (brickH + 4)) % 2 === 0 ? 0 : brickW / 2;
            for (let x = -brickW; x < size; x += brickW + 4) {
                // Randomize brick color slightly
                const shade = Math.random() * 20 - 10;
                // Parse hex color to rgb to adjust shade? Too complex for now.
                // Just draw rect
                ctx.fillRect(x + offset, y, brickW, brickH);
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        return texture;
    }

    static createPanelTexture(baseColor, accentColor) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Base
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, size, size);

        // Add noise
        this.addNoise(ctx, size, 0.05);

        // Panels
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 4;
        ctx.beginPath();

        // Simple panel pattern
        ctx.rect(10, 10, size - 20, size - 20); // Main frame
        ctx.stroke();

        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(10, size / 2);
        ctx.lineTo(size - 10, size / 2); // Horizontal split
        ctx.stroke();

        // Bolts
        ctx.fillStyle = '#222';
        const boltOffset = 30;
        const bolts = [
            [boltOffset, boltOffset], [size - boltOffset, boltOffset],
            [boltOffset, size - boltOffset], [size - boltOffset, size - boltOffset],
            [boltOffset, size / 2], [size - boltOffset, size / 2]
        ];

        bolts.forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
        });

        // Accent stripe
        if (accentColor) {
            ctx.fillStyle = accentColor;
            ctx.fillRect(size - 40, 40, 20, size - 80);
        }

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    static createHexagonTexture(baseColor, lineColor) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, size, size);

        // Add subtle noise
        this.addNoise(ctx, size, 0.03);

        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2;

        const r = 32;
        const w = r * 2;
        const h = Math.sqrt(3) * r;

        for (let y = -h; y < size + h; y += h) {
            for (let x = -w; x < size + w; x += w * 1.5) {
                const cx = x + (Math.round(y / h) % 2) * w * 0.75;
                const cy = y;

                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle = Math.PI / 3 * i;
                    const hx = cx + r * Math.cos(angle);
                    const hy = cy + r * Math.sin(angle);
                    if (i === 0) ctx.moveTo(hx, hy);
                    else ctx.lineTo(hx, hy);
                }
                ctx.closePath();
                ctx.stroke();
            }
        }

        // Vignette
        const grad = ctx.createRadialGradient(size / 2, size / 2, size / 3, size / 2, size / 2, size);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    static createMetalFloorTexture(baseColor) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, size, size);

        // Add noise
        this.addNoise(ctx, size, 0.1);

        // Grate pattern
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        const holeSize = 8;
        const spacing = 16;

        for (let y = 0; y < size; y += spacing) {
            for (let x = 0; x < size; x += spacing) {
                if ((x / spacing + y / spacing) % 2 === 0) {
                    ctx.fillRect(x, y, holeSize, holeSize);
                }
            }
        }

        // Scratches
        ctx.strokeStyle = 'rgba(200,200,200,0.1)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 50; i++) {
            ctx.beginPath();
            const x = Math.random() * size;
            const y = Math.random() * size;
            ctx.moveTo(x, y);
            ctx.lineTo(x + (Math.random() - 0.5) * 100, y + (Math.random() - 0.5) * 100);
            ctx.stroke();
        }

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    static addNoise(ctx, size, intensity) {
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const val = (Math.random() - 0.5) * 255 * intensity;
            data[i] += val;
            data[i + 1] += val;
            data[i + 2] += val;
        }
        ctx.putImageData(imageData, 0, 0);
    }

    static createCircuitTexture(baseColor, lineColor) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Dark Base
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, size, size);

        // Circuit Lines
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 3;
        ctx.lineCap = 'square';
        ctx.shadowBlur = 10;
        ctx.shadowColor = lineColor;

        const numPaths = 40;
        for (let i = 0; i < numPaths; i++) {
            ctx.beginPath();
            let x = Math.random() * size;
            let y = Math.random() * size;

            // Snap to grid
            x = Math.floor(x / 32) * 32;
            y = Math.floor(y / 32) * 32;

            ctx.moveTo(x, y);

            const segments = Math.floor(Math.random() * 5) + 2;
            for (let j = 0; j < segments; j++) {
                if (Math.random() > 0.5) {
                    x += (Math.random() > 0.5 ? 1 : -1) * 32 * (Math.floor(Math.random() * 3) + 1);
                } else {
                    y += (Math.random() > 0.5 ? 1 : -1) * 32 * (Math.floor(Math.random() * 3) + 1);
                }
                ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Nodes
            ctx.fillStyle = lineColor;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    static createSlimeTexture(baseColor, highlightColor) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, size, size);

        // Bubbles
        for (let i = 0; i < 50; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = Math.random() * 20 + 5;

            const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, highlightColor);
            grad.addColorStop(1, baseColor);

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Ooze trails
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        for (let i = 0; i < 10; i++) {
            ctx.beginPath();
            ctx.moveTo(Math.random() * size, Math.random() * size);
            ctx.bezierCurveTo(
                Math.random() * size, Math.random() * size,
                Math.random() * size, Math.random() * size,
                Math.random() * size, Math.random() * size
            );
            ctx.stroke();
        }

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    static createLavaTexture(baseColor, crackColor) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Dark Rock Base
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, size, size);

        this.addNoise(ctx, size, 0.1);

        // Glowing Cracks (Voronoi-ish)
        ctx.strokeStyle = crackColor;
        ctx.lineWidth = 4;
        ctx.shadowBlur = 15;
        ctx.shadowColor = crackColor;
        ctx.lineJoin = 'round';

        const points = [];
        for (let i = 0; i < 20; i++) {
            points.push({ x: Math.random() * size, y: Math.random() * size });
        }

        // Connect nearby points
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            for (let j = i + 1; j < points.length; j++) {
                const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
                if (d < 150) {
                    ctx.moveTo(points[i].x, points[i].y);
                    ctx.lineTo(points[j].x, points[j].y);
                }
            }
        }
        ctx.stroke();

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }
}
