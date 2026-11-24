export class AmmoDisplay {
    constructor(container) {
        this.element = document.createElement('div');
        this.element.id = 'ammo-container';
        this.element.className = 'mana';
        this.element.innerHTML = `
            <span class="mana__value">0</span>
            <span class="mana__reserve">/ 0</span>
            <span class="mana__label">mana</span>
        `;
        container.appendChild(this.element);

        this.currentEl = this.element.querySelector('.mana__value');
        this.reserveEl = this.element.querySelector('.mana__reserve');
    }

    update(current, reserve) {
        if (current === this._current && reserve === this._reserve) return; // Called every frame
        this._current = current;
        this._reserve = reserve;
        this.currentEl.textContent = current;
        this.reserveEl.textContent = `/ ${reserve}`;
        this.element.classList.toggle('mana--empty', current === 0);
        this.element.classList.toggle('mana--low', current > 0 && current < 10);
    }
}
