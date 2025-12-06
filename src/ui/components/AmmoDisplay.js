export class AmmoDisplay {
    constructor(container) {
        this.element = document.createElement('div');
        this.element.id = 'ammo-container';
        this.element.innerHTML = `
            <div class="hud-label">Mana</div>
            <div>
                <span class="ammo-value" id="ammo-current">0</span>
                <span class="ammo-reserve" id="ammo-reserve">/ 0</span>
            </div>
        `;
        container.appendChild(this.element);

        this.currentEl = this.element.querySelector('#ammo-current');
        this.reserveEl = this.element.querySelector('#ammo-reserve');
    }

    update(current, reserve) {
        this.currentEl.textContent = current;
        this.reserveEl.textContent = `/ ${reserve}`;

        if (current === 0) {
            this.currentEl.style.color = '#ff3333'; // Empty
        } else if (current < 10) {
            this.currentEl.style.color = '#ffff00'; // Low
        } else {
            this.currentEl.style.color = '#00aaff'; // Mana Blue
        }
    }

    setReloadCallback(callback) {
        // No-op: Reload button removed from HUD
    }
}
