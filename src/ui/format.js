// French number formatting shared by the HUD and the menus
const oneDecimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const NNBSP = ' '; // Narrow no-break space before units, as French typography wants

export const num = (n) => oneDecimal.format(n);
export const pct = (n) => `${Math.round(n)}${NNBSP}%`;
export const unit = (n, u) => `${num(n)}${NNBSP}${u}`;

// Armor points and the share of damage they stop (`factor`: armorDamageFactor), e.g. « 50 (33 %) »
export const armorText = (armor, factor) => `${num(armor)} (${pct((1 - factor) * 100)})`;
// Explosion chance in %: past 100 %, the surplus adds to the explosion's damage
export const explosionText = (n) => (n > 100 ? `${pct(100)}, +${pct(n - 100)} dégâts` : pct(n));

// Escape text that ends up in innerHTML
export const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
