# Contributing

## Reporting a bug

[Open an issue](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/new/choose) with the bug form. Most problems depend on the Spotify version, the theme and other extensions, so the form asks for them, plus what the self-test copies to your clipboard ([how to run it](TESTING.md)).

## Development (Windows)

You need Node.js (LTS) and Spicetify with devtools (`spicetify enable-devtools`).

```powershell
npm ci
npm run watch      # builds dev/ whenever src/ changes
```

`dev/` (not committed) holds the same code as `dist/` plus an inline source map, so devtools shows the files in `src/` with their comments. `npm run dev` builds it once, `npm run build` writes `dist/`.

Link the dev file into Spicetify's `Extensions` folder once (Developer Mode lets `mklink` run without admin), register it and apply:

```powershell
cmd /c mklink "$env:APPDATA\spicetify\Extensions\gradientBars.js" "<repo>\dev\gradientBars.js"
spicetify config extensions gradientBars.js
spicetify apply
```

After each rebuild run `spicetify refresh -e` and reload Spotify.

## Layout

- `src/shared/`: everything both bars use. It reads each bar's own settings through `ext:config` and `ext:hooks`.
- `src/gpb/`, `src/gcb/`: each bar's own code; `src/gb/`: Gradient Bars' `__gb`.
- `dist/`: the built files, committed, because the Marketplace loads them from the repo. Never edit them by hand.

## Pull requests

- Run `npm run build` and commit `dist/` with your change. CI fails if `dist/` doesn't match `src/`.
- Run the self-tests (`TESTING.md`) for the bar you changed, and add a check for what you fixed.
- British English in UI text and docs ("colour"). Product names in full: Gradient Progress Bar, Gradient Connect Bar, Gradient Bars.
