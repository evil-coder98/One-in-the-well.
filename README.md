# One in the Well — Prototype v2

This build focuses on the intended game structure:

- Low-poly, intentionally pixelated rendering
- Visible claustrophobic well walls and lower well
- 1–3 bars per layer
- Randomized bar positions
- Loose bars visually distinct from normal bars
- Loose-bar frequency ramps from roughly 1/10 toward a 1/3 cap
- Obstacles: quarter/half-wall sectors, including tall multi-layer obstacles
- Wooden boards: large blockades that can span multiple layers and take time to pry open
- Obstacles, boards, and loose bars become more common with progression
- `ONE IN THE WELL.` and `TWO IN THE WELL.` are the only in-game text
- Creature chases
- Proximity-based creature volume
- Extremely aggressive close-range camera shake
- After enough chases, an occasional endless chase
- Endless chase accelerates toward 2x speed
- Hard mode makes the creature 1.5x faster
- Static GitHub Pages compatible

## GitHub Pages

Put `index.html`, `style.css`, and `game.js` in the repository root, then enable:

Settings → Pages → Deploy from a branch → `main` → `/ (root)`

No Codespace is required.
