export class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    ensureContext() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    createNoiseBuffer() {
        if (this.noiseBuffer) return this.noiseBuffer;
        const bufferSize = this.ctx.sampleRate * 2; // 2 seconds
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        this.noiseBuffer = buffer;
        return buffer;
    }

    playShoot() {
        this.ensureContext();

        // Softened Ray Gun style
        const buffer = this.createNoiseBuffer();
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.08, this.ctx.currentTime); // Reduced from 0.15
        noiseGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.02);

        // Main laser tone - triangle for smoother sound
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle'; // Softer than sawtooth
        osc.frequency.setValueAtTime(650, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.09);

        // Subtle high harmonic
        const osc2 = this.ctx.createOscillator();
        osc2.type = 'sine'; // Much softer than square
        osc2.frequency.setValueAtTime(1300, this.ctx.currentTime);
        osc2.frequency.exponentialRampToValueAtTime(240, this.ctx.currentTime + 0.07);

        const oscGain = this.ctx.createGain();
        oscGain.gain.setValueAtTime(0.16, this.ctx.currentTime); // Reduced from 0.22
        oscGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.09);

        noise.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        osc.connect(oscGain);
        osc2.connect(oscGain);
        oscGain.connect(this.ctx.destination);

        noise.start();
        noise.stop(this.ctx.currentTime + 0.02);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.09);
        osc2.start();
        osc2.stop(this.ctx.currentTime + 0.07);
    }

    playHit() {
        this.ensureContext();
        const osc = this.ctx.createOscillator();
        osc.type = 'sine'; // Softer wave type
        osc.frequency.setValueAtTime(800, this.ctx.currentTime); // Higher, less harsh frequency
        osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.08);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.12, this.ctx.currentTime); // Lower volume
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.08); // Shorter duration
    }

    playCritHit() {
        this.ensureContext();

        // Softer "glassy" ping for crit
        const osc = this.ctx.createOscillator();
        osc.type = 'sine'; // Sine is much smoother/softer than triangle
        osc.frequency.setValueAtTime(1000, this.ctx.currentTime); // Slightly lower pitch
        osc.frequency.exponentialRampToValueAtTime(500, this.ctx.currentTime + 0.15);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.15, this.ctx.currentTime); // Reduced volume (was 0.3)
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

        // Very subtle noise for texture (drastically reduced)
        const buffer = this.createNoiseBuffer();
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.05, this.ctx.currentTime); // Was 0.2
        noiseGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05); // Shorter

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        noise.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
        noise.start();
        noise.stop(this.ctx.currentTime + 0.05);
    }

    playPlayerHit() {
        this.ensureContext();
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(50, this.ctx.currentTime + 0.3);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }

    playPickup() {
        this.ensureContext();
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.1);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    }

    playReload() {
        this.ensureContext();
        const now = this.ctx.currentTime;

        // Smooth power-up sweep
        const osc1 = this.ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(200, now);
        osc1.frequency.exponentialRampToValueAtTime(800, now + 0.3);

        const gain1 = this.ctx.createGain();
        gain1.gain.setValueAtTime(0.2, now);
        gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

        osc1.connect(gain1);
        gain1.connect(this.ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.3);

        // Bright harmonic overlay
        const osc2 = this.ctx.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(400, now);
        osc2.frequency.exponentialRampToValueAtTime(1200, now + 0.25);

        const gain2 = this.ctx.createGain();
        gain2.gain.setValueAtTime(0.15, now);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

        osc2.connect(gain2);
        gain2.connect(this.ctx.destination);
        osc2.start(now);
        osc2.stop(now + 0.25);

        // Satisfying "ding" at the end
        const ding = this.ctx.createOscillator();
        ding.type = 'sine';
        ding.frequency.setValueAtTime(1200, now + 0.3);
        ding.frequency.exponentialRampToValueAtTime(800, now + 0.45);

        const dingGain = this.ctx.createGain();
        dingGain.gain.setValueAtTime(0.25, now + 0.3);
        dingGain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

        ding.connect(dingGain);
        dingGain.connect(this.ctx.destination);
        ding.start(now + 0.3);
        ding.stop(now + 0.45);
    }
    playPowerup() {
        this.ensureContext();
        const now = this.ctx.currentTime;

        // Magical chime
        const frequencies = [523.25, 659.25, 783.99, 1046.50]; // C Major Arpeggio
        frequencies.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.05);
            osc.frequency.exponentialRampToValueAtTime(freq * 2, now + i * 0.05 + 0.3);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.1, now + i * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.05 + 0.3);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
        });
    }

    playExplosion() {
        this.ensureContext();
        const buffer = this.createNoiseBuffer();
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);

        noise.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);

        noise.start();
        noise.stop(this.ctx.currentTime + 0.5);
    }
}

export const soundManager = new SoundManager();
