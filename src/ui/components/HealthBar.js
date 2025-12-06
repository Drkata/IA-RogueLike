export class HealthBar {
    constructor(container) {
        this.element = document.createElement('div');
        this.element.id = 'health-container';
        this.element.innerHTML = `
            <div class="hud-label">Integrity</div>
            <div class="health-bar-frame">
                <div class="health-bar-fill" id="health-fill"></div>
            </div>
            <div class="health-value" id="health-text">100%</div>
        `;
        container.appendChild(this.element);

        this.fill = this.element.querySelector('#health-fill');
        this.text = this.element.querySelector('#health-text');
    }

    update(current, max) {
        const percentage = Math.max(0, Math.min(100, (current / max) * 100));
        this.fill.style.width = `${percentage}%`;
        this.text.textContent = `${Math.ceil(current)}%`;

        // Color transition logic
        if (percentage > 50) {
            this.fill.style.backgroundPosition = '100% 0'; // Green
            this.text.classList.remove('low-health');
            this.fill.parentElement.classList.remove('low-health');
        } else if (percentage > 25) {
            this.fill.style.backgroundPosition = '50% 0'; // Yellow
            this.text.classList.remove('low-health');
            this.fill.parentElement.classList.remove('low-health');
        } else {
            this.fill.style.backgroundPosition = '0% 0'; // Red
            this.text.classList.add('low-health');
            this.fill.parentElement.classList.add('low-health');
        }
    }

    triggerDamageEffect() {
        this.element.classList.remove('shake');
        void this.element.offsetWidth; // Trigger reflow
        this.element.classList.add('shake');
    }
}
