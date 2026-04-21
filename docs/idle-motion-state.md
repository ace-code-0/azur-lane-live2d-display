# Idle Motion State

The model's `Idle` group is stateful. `idle0` is the default no-interaction idle motion, while `idle1`, `idle2`, and `idle3` are idle branches entered by special interaction motions.

The source model expresses this through `VarFloats`:

- `Type: 1` with `equal N` is a playback condition.
- `Type: 2` with `assign N` updates the variable after a motion starts.

The app must not let `pixi-live2d-display` randomly pick from the whole `Idle` group, because the library does not evaluate these `VarFloats`. Instead, the app keeps the `idle` variable itself and chooses the matching `Idle` motion index.
