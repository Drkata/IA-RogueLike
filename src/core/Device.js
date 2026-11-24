// What the player holds, decided once at load from the primary input (not the user agent):
//   touch: a finger is the main pointer (phone or tablet) → on-screen controls, no pointer lock
//   phone: touch with a small screen → compact HUD and menus, landscape only
export function detectDevice() {
    const touch = window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
    const phone = touch && Math.min(window.screen.width, window.screen.height) < 600; // CSS pixels
    return { touch, phone };
}

export const DEVICE = detectDevice();

// `is-touch` / `is-phone` classes on <html> drive the touch layout in src/ui/hud.css
export function applyDeviceClasses(device = DEVICE) {
    document.documentElement.classList.toggle('is-touch', device.touch);
    document.documentElement.classList.toggle('is-phone', device.phone);
}
