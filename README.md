# One in the Well — Prototype

A static WebGL prototype designed for iPad/Safari.

## Run it

The easiest option is GitHub Pages:

1. Create a repository.
2. Put `index.html`, `style.css`, and `game.js` in the repository root.
3. In GitHub, open **Settings → Pages**.
4. Deploy the `main` branch/root.
5. Open the resulting GitHub Pages URL on the iPad.

The prototype imports Three.js from jsDelivr, so the page needs internet access.

## Controls

- Drag anywhere to rotate the camera.
- Tap the next bar to grab/pull upward.
- Wooden boards are removed by tapping them five times.
- Loose bars have a 3-second danger window.
- After the randomly generated `TWO IN THE WELL` milestone, random horror events can occur.
- During a creature chase, its position is tracked without a monster model.
- The closer it gets, the louder the placeholder creature audio becomes and the harder the camera shakes.

## Run generation

Each run rolls three milestones:

1. loose bars
2. wooden boards
3. `TWO IN THE WELL`

The generated values are printed to the browser console for prototype testing.

## Next development targets

- More convincing climbing animation/body positioning
- Better bar placement and visibility
- Proper board pry interaction
- Real spatial audio
- Creature occlusion/fog behavior
- More horror event types
- Procedural well structure
- Final textures and lighting
- Save/settings screen
- Better death and respawn sequence
