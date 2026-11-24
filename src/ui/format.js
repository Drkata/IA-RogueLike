// French number formatting shared by the HUD and the menus
const oneDecimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const NNBSP = ' '; // Narrow no-break space before units, as French typography wants

export const num = (n) => oneDecimal.format(n);
export const pct = (n) => `${Math.round(n)}${NNBSP}%`;
export const unit = (n, u) => `${num(n)}${NNBSP}${u}`;

// Escape text that ends up in innerHTML
export const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
