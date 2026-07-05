window.onerror = function(msg, url, lineNo, columnNo, error) {
    const errorDiv = document.createElement('div');
    errorDiv.style.position = 'absolute';
    errorDiv.style.top = '10px';
    errorDiv.style.left = '10px';
    errorDiv.style.backgroundColor = 'rgba(255,0,0,0.8)';
    errorDiv.style.color = 'white';
    errorDiv.style.padding = '20px';
    errorDiv.style.zIndex = '999999';
    errorDiv.style.fontFamily = 'monospace';
    errorDiv.innerHTML = `<h3>FATAL ERROR</h3>
        <p>${msg}</p>
        <p>File: ${url}:${lineNo}:${columnNo}</p>
        <pre>${error && error.stack ? error.stack : ''}</pre>`;
    document.body.appendChild(errorDiv);
};

window.addEventListener("unhandledrejection", function(event) {
    const errorDiv = document.createElement('div');
    errorDiv.style.position = 'absolute';
    errorDiv.style.top = '10px';
    errorDiv.style.left = '10px';
    errorDiv.style.backgroundColor = 'rgba(255,0,0,0.8)';
    errorDiv.style.color = 'white';
    errorDiv.style.padding = '20px';
    errorDiv.style.zIndex = '999999';
    errorDiv.style.fontFamily = 'monospace';
    errorDiv.innerHTML = `<h3>UNHANDLED PROMISE REJECTION</h3>
        <p>${event.reason}</p>
        <pre>${event.reason && event.reason.stack ? event.reason.stack : ''}</pre>`;
    document.body.appendChild(errorDiv);
});

import { Game } from './core/Game.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';

const stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: mb
stats.dom.style.position = 'absolute';
stats.dom.style.top = '20px';
stats.dom.style.left = '240px';
document.body.appendChild(stats.dom);
window.stats = stats; // Expose globally for Game.js loop

const game = new Game();
