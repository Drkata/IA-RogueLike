import { Game } from './core/Game.js';
import { DEVICE, applyDeviceClasses } from './core/Device.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';

// Crashes are shown on screen: there is no console during playtests on other machines
function showFatalError(title, message, stack = '') {
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;top:10px;left:10px;z-index:999999;padding:20px;max-width:90vw;' +
        'background:rgba(120,0,0,0.9);color:#fff;font-family:monospace;white-space:pre-wrap;';
    const heading = document.createElement('h3');
    heading.textContent = title;
    const details = document.createElement('p');
    details.textContent = message;
    const trace = document.createElement('pre');
    trace.textContent = stack;
    box.append(heading, details, trace);
    document.body.appendChild(box);
}

window.onerror = (msg, url, lineNo, columnNo, error) => {
    showFatalError('FATAL ERROR', `${msg}\nFile: ${url}:${lineNo}:${columnNo}`, error?.stack);
};

window.addEventListener('unhandledrejection', (event) => {
    showFatalError('UNHANDLED PROMISE REJECTION', String(event.reason), event.reason?.stack);
});

applyDeviceClasses();

// FPS counter for development, kept off small touch screens where it hides the HUD
if (!DEVICE.touch) {
    const stats = new Stats();
    stats.showPanel(0); // 0: fps, 1: ms, 2: mb
    stats.dom.style.cssText = 'position:absolute;top:18px;right:70px;opacity:0.8;';
    document.body.appendChild(stats.dom);
    window.stats = stats; // Updated by the Game loop
}

new Game();
