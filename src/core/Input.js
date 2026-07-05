import { soundManager } from '../systems/SoundManager.js';

export class Input {
    constructor() {
        this.keys = {};
        this.mouseDelta = { x: 0, y: 0 };

        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));
        document.addEventListener('click', () => this.requestPointerLock());

        // Audio Context Resume (One-time)
        const resumeAudio = () => {
            soundManager.ensureContext();
            document.removeEventListener('click', resumeAudio);
            document.removeEventListener('keydown', resumeAudio);
        };
        document.addEventListener('click', resumeAudio);
        document.addEventListener('keydown', resumeAudio);
    }

    onKeyDown(e) {
        this.keys[e.code] = true;
    }

    onKeyUp(e) {
        this.keys[e.code] = false;
    }

    onMouseDown(e) {
        if (e.button === 0) this.keys['Mouse0'] = true;
        if (e.button === 2) this.keys['Mouse1'] = true;
    }

    onMouseUp(e) {
        if (e.button === 0) this.keys['Mouse0'] = false;
        if (e.button === 2) this.keys['Mouse1'] = false;
    }

    onMouseMove(e) {
        if (document.pointerLockElement) {
            this.mouseDelta.x += e.movementX;
            this.mouseDelta.y += e.movementY;
        }
    }

    requestPointerLock() {
        // Don't request pointer lock if game is paused (upgrade menu open)
        if (window.game && window.game.isPaused) {
            return;
        }
        const promise = document.body.requestPointerLock();
        if (promise) {
            promise.catch(err => {
                // Ignore PointerLock errors caused by rapid clicking
            });
        }
    }

    isKeyDown(code) {
        return !!this.keys[code];
    }

    getMouseDelta() {
        const delta = { ...this.mouseDelta };
        this.mouseDelta = { x: 0, y: 0 };
        return delta;
    }
}
