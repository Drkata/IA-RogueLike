export class BuffDisplay {
    constructor(container) {
        this.element = document.createElement('div');
        this.element.id = 'buff-container';
        this.element.className = 'buffs';
        this.element.innerHTML = `
            <div class="buff buff--berserk" hidden>
                <span class="buff__name">Furie berserk</span>
                <span class="buff__track"><span class="buff__fill"></span></span>
            </div>
        `;
        container.appendChild(this.element);
        this.berserk = this.element.querySelector('.buff--berserk');
        this.berserkFill = this.berserk.querySelector('.buff__fill');
    }

    updateBerserk(active, time, max) {
        const ratio = active ? Math.round((time / max) * 100) / 100 : -1; // -1 = hidden
        if (ratio === this._lastRatio) return; // Called every frame
        this._lastRatio = ratio;

        this.berserk.hidden = !active;
        if (active) this.berserkFill.style.transform = `scaleX(${ratio})`;
    }
}
