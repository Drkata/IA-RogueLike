export class TouchControls {
    constructor(input) {
        this.input = input;
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        // Configuration
        this.joystickRadius = 50;
        this.joystickBaseRadius = 80;
        this.lookSensitivity = 2.0;

        // State
        this.leftTouchId = null;
        this.leftOrigin = { x: 0, y: 0 };
        this.leftCurrent = { x: 0, y: 0 };

        this.rightTouchId = null;
        this.lastLookPos = { x: 0, y: 0 };

        this.initUI();
        this.addListeners();
    }

    initUI() {
        this.container = document.createElement('div');
        this.container.id = 'touch-controls';
        Object.assign(this.container.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: '999',
            display: 'none' // Hidden by default, shown if touch detected
        });

        // Dynamic Sizing
        const minDim = Math.min(window.innerWidth, window.innerHeight);
        const baseSize = Math.max(60, Math.min(120, minDim * 0.20)); // 20% of screen, clamped 60-120px
        const stickSize = baseSize * 0.4;
        const btnSize = Math.max(50, Math.min(100, minDim * 0.15)); // 15% of screen, clamped 50-100px

        this.joystickBaseRadius = baseSize / 2;

        // Left Joystick Base
        this.joyBase = document.createElement('div');
        Object.assign(this.joyBase.style, {
            position: 'absolute',
            bottom: '30px',
            left: '30px',
            width: `${baseSize}px`,
            height: `${baseSize}px`,
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            pointerEvents: 'auto',
            touchAction: 'none'
        });

        // Left Joystick Stick
        this.joyStick = document.createElement('div');
        Object.assign(this.joyStick.style, {
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: `${stickSize}px`,
            height: `${stickSize}px`,
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 255, 255, 0.5)',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none'
        });
        this.joyBase.appendChild(this.joyStick);
        this.container.appendChild(this.joyBase);

        // Right Look Area (Invisible, covers right half)
        this.lookZone = document.createElement('div');
        Object.assign(this.lookZone.style, {
            position: 'absolute',
            top: '0',
            right: '0',
            width: '50%',
            height: '100%',
            pointerEvents: 'auto',
            touchAction: 'none'
        });
        this.container.appendChild(this.lookZone);

        // Shoot Button
        this.shootBtn = document.createElement('div');
        Object.assign(this.shootBtn.style, {
            position: 'absolute',
            bottom: '50px',
            right: '30px',
            width: `${btnSize}px`,
            height: `${btnSize}px`,
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 50, 50, 0.5)',
            border: '2px solid rgba(255, 255, 255, 0.5)',
            pointerEvents: 'auto',
            touchAction: 'none',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            color: 'white',
            fontFamily: 'sans-serif',
            fontWeight: 'bold',
            fontSize: `${btnSize * 0.3}px`,
            userSelect: 'none'
        });
        this.shootBtn.innerText = 'FIRE';
        this.container.appendChild(this.shootBtn);

        // Jump Button
        this.jumpBtn = document.createElement('div');
        Object.assign(this.jumpBtn.style, {
            position: 'absolute',
            bottom: `${50 + btnSize + 20}px`, // Above Fire button
            right: '30px',
            width: `${btnSize * 0.8}px`, // Slightly smaller
            height: `${btnSize * 0.8}px`,
            borderRadius: '50%',
            backgroundColor: 'rgba(50, 255, 50, 0.5)',
            border: '2px solid rgba(255, 255, 255, 0.5)',
            pointerEvents: 'auto',
            touchAction: 'none',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            color: 'white',
            fontFamily: 'sans-serif',
            fontWeight: 'bold',
            fontSize: `${btnSize * 0.25}px`,
            userSelect: 'none'
        });
        this.jumpBtn.innerText = 'JUMP';
        this.container.appendChild(this.jumpBtn);

        // Reload Button
        this.reloadBtn = document.createElement('div');
        Object.assign(this.reloadBtn.style, {
            position: 'absolute',
            bottom: '50px',
            right: `${30 + btnSize + 20}px`, // Left of Fire button
            width: `${btnSize * 0.8}px`,
            height: `${btnSize * 0.8}px`,
            borderRadius: '50%',
            backgroundColor: 'rgba(50, 50, 255, 0.5)',
            border: '2px solid rgba(255, 255, 255, 0.5)',
            pointerEvents: 'auto',
            touchAction: 'none',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            color: 'white',
            fontFamily: 'sans-serif',
            fontWeight: 'bold',
            fontSize: `${btnSize * 0.25}px`,
            userSelect: 'none'
        });
        this.reloadBtn.innerText = 'RELOAD';
        this.container.appendChild(this.reloadBtn);

        document.body.appendChild(this.container);
    }

    addListeners() {
        // Detect Touch Device
        window.addEventListener('touchstart', () => {
            this.container.style.display = 'block';
        }, { once: true, passive: false });

        // Joystick (Left)
        this.joyBase.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.changedTouches[0];
            this.leftTouchId = touch.identifier;
            const rect = this.joyBase.getBoundingClientRect();
            this.leftOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            this.updateJoystick(touch.clientX, touch.clientY);
        }, { passive: false });

        this.joyBase.addEventListener('touchmove', (e) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.leftTouchId) {
                    this.updateJoystick(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
                    break;
                }
            }
        }, { passive: false });

        const endJoystick = (e) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.leftTouchId) {
                    this.leftTouchId = null;
                    this.resetJoystick();
                    break;
                }
            }
        };
        this.joyBase.addEventListener('touchend', endJoystick, { passive: false });
        this.joyBase.addEventListener('touchcancel', endJoystick, { passive: false });

        // Look (Right Zone)
        this.lookZone.addEventListener('touchstart', (e) => {
            e.preventDefault();
            // Only track if not already tracking
            if (this.rightTouchId === null) {
                const touch = e.changedTouches[0];
                this.rightTouchId = touch.identifier;
                this.lastLookPos = { x: touch.clientX, y: touch.clientY };
            }
        }, { passive: false });

        this.lookZone.addEventListener('touchmove', (e) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.rightTouchId) {
                    const touch = e.changedTouches[i];
                    const dx = touch.clientX - this.lastLookPos.x;
                    const dy = touch.clientY - this.lastLookPos.y;

                    this.input.mouseDelta.x += dx * this.lookSensitivity;
                    this.input.mouseDelta.y += dy * this.lookSensitivity;

                    this.lastLookPos = { x: touch.clientX, y: touch.clientY };
                    break;
                }
            }
        }, { passive: false });

        const endLook = (e) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.rightTouchId) {
                    this.rightTouchId = null;
                    break;
                }
            }
        };
        this.lookZone.addEventListener('touchend', endLook, { passive: false });
        this.lookZone.addEventListener('touchcancel', endLook, { passive: false });

        // Shoot Button
        this.shootBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.input.keys['Mouse0'] = true;
            this.shootBtn.style.backgroundColor = 'rgba(255, 50, 50, 0.8)';
        }, { passive: false });

        const endShoot = (e) => {
            e.preventDefault();
            this.input.keys['Mouse0'] = false;
            this.shootBtn.style.backgroundColor = 'rgba(255, 50, 50, 0.5)';
        };
        this.shootBtn.addEventListener('touchend', endShoot, { passive: false });
        this.shootBtn.addEventListener('touchcancel', endShoot, { passive: false });

        // Jump Button
        this.jumpBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.input.keys['Space'] = true;
            this.jumpBtn.style.backgroundColor = 'rgba(50, 255, 50, 0.8)';
        }, { passive: false });

        const endJump = (e) => {
            e.preventDefault();
            this.input.keys['Space'] = false;
            this.jumpBtn.style.backgroundColor = 'rgba(50, 255, 50, 0.5)';
        };
        this.jumpBtn.addEventListener('touchend', endJump, { passive: false });
        this.jumpBtn.addEventListener('touchcancel', endJump, { passive: false });

        // Reload Button
        this.reloadBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.input.keys['KeyR'] = true;
            this.reloadBtn.style.backgroundColor = 'rgba(50, 50, 255, 0.8)';
        }, { passive: false });

        const endReload = (e) => {
            e.preventDefault();
            this.input.keys['KeyR'] = false;
            this.reloadBtn.style.backgroundColor = 'rgba(50, 50, 255, 0.5)';
        };
        this.reloadBtn.addEventListener('touchend', endReload, { passive: false });
        this.reloadBtn.addEventListener('touchcancel', endReload, { passive: false });
    }

    updateJoystick(x, y) {
        const dx = x - this.leftOrigin.x;
        const dy = y - this.leftOrigin.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        const maxDist = this.joystickBaseRadius - 30; // 30 is half stick size
        const clampedDist = Math.min(distance, maxDist);

        const stickX = Math.cos(angle) * clampedDist;
        const stickY = Math.sin(angle) * clampedDist;

        this.joyStick.style.transform = `translate(calc(-50% + ${stickX}px), calc(-50% + ${stickY}px))`;

        // Map to Keys
        // Threshold for activation
        const threshold = 20;

        this.input.keys['KeyW'] = dy < -threshold;
        this.input.keys['KeyS'] = dy > threshold;
        this.input.keys['KeyA'] = dx < -threshold;
        this.input.keys['KeyD'] = dx > threshold;
    }

    resetJoystick() {
        this.joyStick.style.transform = 'translate(-50%, -50%)';
        this.input.keys['KeyW'] = false;
        this.input.keys['KeyS'] = false;
        this.input.keys['KeyA'] = false;
        this.input.keys['KeyD'] = false;
    }
}
