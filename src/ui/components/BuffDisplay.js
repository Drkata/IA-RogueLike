export class BuffDisplay {
    constructor(container) {
        this.element = document.createElement('div');
        this.element.id = 'buff-container';
        this.element.style.position = 'absolute';
        this.element.style.bottom = '120px'; // Above health/ammo
        this.element.style.left = '50%';
        this.element.style.transform = 'translateX(-50%)';
        this.element.style.display = 'flex';
        this.element.style.flexDirection = 'column';
        this.element.style.alignItems = 'center';
        this.element.style.gap = '5px';
        this.element.style.pointerEvents = 'none';
        container.appendChild(this.element);

        // Berserk Bar
        this.berserkBar = document.createElement('div');
        this.berserkBar.id = 'berserk-bar';
        this.berserkBar.style.width = '300px';
        this.berserkBar.style.height = '10px';
        this.berserkBar.style.backgroundColor = '#440000';
        this.berserkBar.style.border = '1px solid #ff0000';
        this.berserkBar.style.display = 'none'; // Hidden by default

        this.berserkFill = document.createElement('div');
        this.berserkFill.style.width = '100%';
        this.berserkFill.style.height = '100%';
        this.berserkFill.style.backgroundColor = '#ff0000';
        this.berserkFill.style.boxShadow = '0 0 10px #ff0000';
        this.berserkFill.style.transition = 'width 0.1s linear';

        this.berserkLabel = document.createElement('div');
        this.berserkLabel.textContent = 'BERSERK';
        this.berserkLabel.style.color = '#ff0000';
        this.berserkLabel.style.fontSize = '14px';
        this.berserkLabel.style.fontWeight = 'bold';
        this.berserkLabel.style.marginBottom = '2px';
        this.berserkLabel.style.textShadow = '0 0 5px black';

        this.berserkBar.appendChild(this.berserkFill);
        this.element.appendChild(this.berserkLabel);
        this.element.appendChild(this.berserkBar);
    }

    update(buffs) {
        // Berserk
        if (buffs.berserk && buffs.berserk.active) {
            this.berserkBar.style.display = 'block';
            this.berserkLabel.style.display = 'block';

            const pct = (buffs.berserk.time / buffs.berserk.max) * 100;
            this.berserkFill.style.width = `${pct}%`;
        } else {
            this.berserkBar.style.display = 'none';
            this.berserkLabel.style.display = 'none';
        }
    }
}
