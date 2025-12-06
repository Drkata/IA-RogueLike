export class HealthBar {
    constructor(container) {
        this.element = document.createElement('div');
        this.element.id = 'health-container';
        this.element.innerHTML = `
            <div class="hud-label">Integrity</div>
            
            <!-- Shield Bar -->
            <div class="shield-bar-frame" style="height: 5px; background: #002244; margin-bottom: 2px; border: 1px solid #004488; display: none;">
                <div class="shield-bar-fill" id="shield-fill" style="width: 0%; height: 100%; background: #00ffff; box-shadow: 0 0 5px #00ffff;"></div>
            </div>

            <div class="health-bar-frame">
                <div class="health-bar-fill" id="health-fill"></div>
            </div>
            <div class="health-value" id="health-text">100%</div>
        `;
        container.appendChild(this.element);

        this.fill = this.element.querySelector('#health-fill');
        this.shieldFill = this.element.querySelector('#shield-fill');
        this.shieldFrame = this.element.querySelector('.shield-bar-frame');
        this.text = this.element.querySelector('#health-text');
    }

    update(current, max, shield = 0) {
        const percentage = Math.max(0, Math.min(100, (current / max) * 100));
        this.fill.style.width = `${percentage}%`;
        this.text.textContent = `${Math.ceil(current)}%`;

        // Shield Update
        if (shield > 0) {
            this.shieldFrame.style.display = 'block';
            // Shield max is arbitrary, let's say 100 for now or relative to max health
            // Let's make it relative to 100 for visualization
            const shieldPct = Math.min(100, shield);
            this.shieldFill.style.width = `${shieldPct}%`;
        } else {
            this.shieldFrame.style.display = 'none';
        }

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
