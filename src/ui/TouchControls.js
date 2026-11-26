import { SVG_ICONS } from './SVGIcons.js';

// On-screen controls for touch devices (see ART_DIRECTION.md, section 4).
//   Left 40% of the screen: floating analog stick (appears under the thumb)
//   Elsewhere: drag to look. The fire button also aims while held.
//   Thumb arc, bottom right: attack, jump, second move (staff charge / sword guard), reload, switch weapon,
//   interact. Buttons with two icons show the staff's or the sword's (body.weapon-sword).
const STICK_RADIUS = 56; // px: knob travel for a full push
const DEAD_ZONE = 0.12;
const LOOK_SPEED = 2.2; // Mouse pixels of rotation per finger pixel
const STICK_ZONE = 0.4; // Share of the screen width, from the left, that starts the stick

const BUTTONS = [
    { key: 'Mouse0', icon: ['touchFire', 'touchSlash'], label: 'Attaquer', modifier: 'fire', aims: true },
    { key: 'Space', icon: 'touchJump', label: 'Sauter', modifier: 'jump' },
    { key: 'Mouse1', icon: ['touchCharge', 'touchGuard'], label: 'Tir chargé (sceptre) ou garde (épée)', modifier: 'secondary' },
    { key: 'KeyR', icon: 'touchReload', label: 'Recharger', modifier: 'reload' },
    { key: 'KeyQ', icon: 'touchSwitch', label: "Changer d'arme", modifier: 'switch' },
    { key: 'KeyE', icon: 'touchAction', label: 'Interagir', modifier: 'action' }
];

export class TouchControls {
    constructor(input) {
        this.input = input;
        this.pointers = new Map(); // pointerId -> what that finger is doing
        this.askedFullscreen = false;

        this.root = document.createElement('div');
        this.root.className = 'touch-layer';
        this.root.innerHTML = `
            <div class="touch-stick is-idle" aria-hidden="true"><span class="touch-stick__knob"></span></div>
            <div class="touch-buttons">
                ${BUTTONS.map((b, i) => `
                    <button type="button" class="touch-btn touch-btn--${b.modifier}" data-index="${i}" aria-label="${b.label}">
                        ${Array.isArray(b.icon)
                            ? `<span class="for-staff">${SVG_ICONS[b.icon[0]]}</span><span class="for-sword">${SVG_ICONS[b.icon[1]]}</span>`
                            : SVG_ICONS[b.icon]}
                    </button>`).join('')}
            </div>`;
        document.body.appendChild(this.root);
        this.stick = this.root.querySelector('.touch-stick');
        this.knob = this.root.querySelector('.touch-stick__knob');

        this.root.addEventListener('pointerdown', (e) => this._down(e));
        this.root.addEventListener('pointermove', (e) => this._move(e));
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
            this.root.addEventListener(type, (e) => this._up(e));
        }
        this.root.addEventListener('contextmenu', (e) => e.preventDefault()); // Long press menu
    }

    _down(e) {
        e.preventDefault(); // No compatibility mouse events: a tap must not also count as a click-to-shoot
        this._enterFullscreen();

        const button = e.target.closest('.touch-btn');
        let finger;
        if (button) {
            const spec = BUTTONS[button.dataset.index];
            this.input.keys[spec.key] = true;
            button.classList.add('is-held');
            finger = { kind: 'button', key: spec.key, button, aims: spec.aims };
        } else if (e.clientX < window.innerWidth * STICK_ZONE && ![...this.pointers.values()].some(f => f.kind === 'stick')) {
            this.stick.classList.remove('is-idle');
            this.stick.style.left = `${e.clientX}px`;
            this.stick.style.top = `${e.clientY}px`;
            finger = { kind: 'stick', originX: e.clientX, originY: e.clientY };
        } else {
            finger = { kind: 'look' };
        }
        finger.lastX = e.clientX;
        finger.lastY = e.clientY;
        this.pointers.set(e.pointerId, finger);
        (button || this.root).setPointerCapture(e.pointerId);
    }

    _move(e) {
        const finger = this.pointers.get(e.pointerId);
        if (!finger) return;

        if (finger.kind === 'stick') {
            const dx = e.clientX - finger.originX;
            const dy = e.clientY - finger.originY;
            const dist = Math.hypot(dx, dy);
            const k = dist > STICK_RADIUS ? STICK_RADIUS / dist : 1;
            this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
            // Analog push in [0, 1] past the dead zone; screen up = forward
            const push = Math.min(1, dist / STICK_RADIUS);
            const scale = push > DEAD_ZONE ? (push - DEAD_ZONE) / (1 - DEAD_ZONE) / (dist || 1) : 0;
            this.input.moveAxis.x = dx * scale;
            this.input.moveAxis.y = -dy * scale;
        } else if (finger.kind === 'look' || finger.aims) {
            this.input.mouseDelta.x += (e.clientX - finger.lastX) * LOOK_SPEED;
            this.input.mouseDelta.y += (e.clientY - finger.lastY) * LOOK_SPEED;
        }
        finger.lastX = e.clientX;
        finger.lastY = e.clientY;
    }

    _up(e) {
        const finger = this.pointers.get(e.pointerId);
        if (!finger) return;
        this.pointers.delete(e.pointerId);

        if (finger.kind === 'button') {
            this.input.keys[finger.key] = false;
            finger.button.classList.remove('is-held');
        } else if (finger.kind === 'stick') {
            this.input.moveAxis.x = 0;
            this.input.moveAxis.y = 0;
            this.knob.style.transform = '';
            this.stick.classList.add('is-idle');
            this.stick.style.left = this.stick.style.top = '';
        }
    }

    // Full screen hides the browser bars; landscape lock only works in full screen (Android).
    // Both are refused on iPhone: the game still works, with the bars visible.
    _enterFullscreen() {
        if (this.askedFullscreen || document.fullscreenElement) return;
        this.askedFullscreen = true;
        const request = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
        if (!request) return;
        request
            .then(() => screen.orientation?.lock?.('landscape'))
            .catch(() => {});
    }
}
