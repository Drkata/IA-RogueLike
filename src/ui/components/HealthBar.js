export class HealthBar {
    constructor(container) {
        this.element = document.createElement('div');
        this.element.id = 'health-container';
        this.element.className = 'vitals';
        this.element.innerHTML = `
            <div class="vitals__shield" hidden><span class="vitals__shield-fill"></span><span class="vitals__shield-fill vitals__shield-fill--over"></span></div>
            <div class="vitals__readout"><span class="vitals__value">100</span><span class="vitals__max">/ 100</span><span class="vitals__shield-value" title="Bouclier" hidden></span></div>
            <div class="vitals__bar"><span class="vitals__fill"></span></div>
        `;
        container.appendChild(this.element);

        this.fill = this.element.querySelector('.vitals__fill');
        this.value = this.element.querySelector('.vitals__value');
        this.max = this.element.querySelector('.vitals__max');
        this.shieldFrame = this.element.querySelector('.vitals__shield');
        [this.shieldFill, this.shieldOver] = this.element.querySelectorAll('.vitals__shield-fill');
        this.shieldValue = this.element.querySelector('.vitals__shield-value');
    }

    update(current, max, shield = 0) {
        const ratio = Math.max(0, Math.min(1, current / max));
        // Called every frame: only touch the DOM when something visible changed
        const key = `${Math.ceil(current)}|${Math.round(max)}|${ratio.toFixed(3)}|${Math.ceil(shield)}`;
        if (key === this._lastKey) return;
        this._lastKey = key;

        this.fill.style.transform = `scaleX(${ratio})`;
        this.value.textContent = Math.ceil(current);
        this.max.textContent = `/ ${Math.round(max)}`;
        this.element.classList.toggle('vitals--wounded', ratio <= 0.5 && ratio > 0.25);
        this.element.classList.toggle('vitals--critical', ratio <= 0.25);

        // The shield bar holds 100 points; a brighter layer over it fills with the next 100. Its points are
        // written beside the health (shields can go well past 100: Aegis pact, wards bought).
        this.shieldFrame.hidden = this.shieldValue.hidden = shield <= 0;
        this.shieldFill.style.transform = `scaleX(${Math.min(1, shield / 100)})`;
        this.shieldOver.style.transform = `scaleX(${Math.min(1, Math.max(0, shield / 100 - 1))})`;
        this.shieldValue.textContent = `+${Math.ceil(shield)}`;
    }

    triggerDamageEffect() {
        this.element.classList.remove('shake');
        void this.element.offsetWidth; // Restart the animation
        this.element.classList.add('shake');
    }
}
