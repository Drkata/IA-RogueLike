import { soundManager } from '../systems/SoundManager.js';
import { TouchControls } from '../ui/TouchControls.js';

export class Input {
    constructor(device) {
        this.keys = {};
        this.mouseDelta = { x: 0, y: 0 };
        this.moveAxis = { x: 0, y: 0 }; // Analog movement from the touch stick: x right, y forward, length ≤ 1
        this.isTouch = device.touch;
        // Touch devices look with the finger; iPhone Safari has no pointer lock at all
        this.canLockPointer = !this.isTouch && !!document.body.requestPointerLock;
        if (this.isTouch) this.touchControls = new TouchControls(this);

        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));
        // The wheel switches weapons: one switch per scroll, however many events a trackpad sends for it
        this.lastWheel = 0;
        document.addEventListener('wheel', (e) => {
            if (!document.pointerLockElement) return; // Menus scroll
            if (e.timeStamp - this.lastWheel > 400) this.keys.Wheel = true;
            this.lastWheel = e.timeStamp;
        }, { passive: true });
        // Clicking the game locks the pointer (first click of a run). Menus ask for it themselves when they
        // close (Game._resume): their click must not request it a second time on its way up.
        document.addEventListener('click', () => window.game?.isPaused || this.requestPointerLock());

        // Audio may only start after a user gesture (pointerup is the one touch screens grant)
        const gestures = ['click', 'keydown', 'pointerup'];
        const resumeAudio = () => {
            soundManager.ensureContext();
            gestures.forEach(type => document.removeEventListener(type, resumeAudio));
        };
        gestures.forEach(type => document.addEventListener(type, resumeAudio));
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
        if (!this.canLockPointer || document.pointerLockElement) return;
        // Success and refusal arrive as pointerlockchange / pointerlockerror events (Game): the promise,
        // where there is one, is only silenced so a refusal is not reported as a crash
        document.body.requestPointerLock()?.catch(() => {});
    }

    exitPointerLock() {
        if (document.pointerLockElement) document.exitPointerLock();
    }

    // Drop every held key and stick push (a menu opened while something was held)
    releaseAll() {
        for (const code in this.keys) this.keys[code] = false;
        this.moveAxis.x = 0;
        this.moveAxis.y = 0;
    }

    // Interaction prompt in the player's controls, e.g. prompt('ouvrir la porte')
    prompt(action) {
        return `${this.isTouch ? "Touchez le bouton d'action" : 'Appuyez sur E'} pour ${action}`;
    }

    isKeyDown(code) {
        return !!this.keys[code];
    }

    // True once per key press (the key must be released to trigger again)
    consumeKey(code) {
        if (!this.keys[code]) return false;
        this.keys[code] = false;
        return true;
    }

    // Mouse movement since the last call (the returned object is reused)
    getMouseDelta() {
        this._delta = this._delta || { x: 0, y: 0 };
        this._delta.x = this.mouseDelta.x;
        this._delta.y = this.mouseDelta.y;
        this.mouseDelta.x = 0;
        this.mouseDelta.y = 0;
        return this._delta;
    }
}
