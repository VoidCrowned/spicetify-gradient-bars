# Testing

Two layers, before every release and after every Spotify update:

1. **Self-tests**: everything that code can check, in seconds.
2. **Visual checklist**: only what a human has to see.

## Opening the devtools console

1. Enable devtools once: `spicetify enable-devtools`.
2. Open the devtools of Spotify's **main window** (not a helper target).
3. If the console says `__gpb is not defined`, run `typeof Spicetify`: `"undefined"` means the wrong target; `"object"` means run `__gpb.status()` (or `__gcb` / `__gb`), which shows whether start-up is waiting, failed or ready.

## Self-tests

```js
await __gpb.selfTest()   // Gradient Progress Bar
await __gcb.selfTest()   // Gradient Connect Bar, ideally while music plays on another device
await __gb.selfTest()    // Gradient Bars: both suites plus its own checks
```

Each applies test settings through the extension's own code, checks the live bar's computed styles and drives the settings window with real events. Afterwards it **restores your settings**. It logs and copies a short report: one summary line per suite (`[gpb] self-test: 295/295 passed`) and one line per failed check. `selfTest({ full: true })` copies the full JSON report instead, with the environment block and every check.

The checks cover start-up and the entry points, the shared top-bar button, rendering in every mode against the live bar, the hard rules (scoping, no `!important`, no layout or theme variables touched), the settings window (dots, stepper, picker, menus, keyboard, Reset), presets, share codes, the clipboard, storage and migrations. Gradient Bars adds: each bar runs exactly once, and the conflict rule when a separate copy is installed too.

## Visual checklist

At most 8 items, only what code can't check:

1. Hover, click-seek and drag the song progress bar, solid and gradient, in each Spread mode: no flicker; Compress, Anchored and Slide look right at the start, middle and end; with Hover → Brighten it brightens gently, the volume slider never.
2. The colour picker is fully visible under Hazy; dragging in the square and hue bar is smooth; the eyedropper works.
3. With playback-bar-waveform: the gradient sits inside the waveform, also in Anchored.
4. Hazy's colour (Custom color, or album art across songs): the bar and the selected option button follow, the label stays readable.
5. The Connect bar (play on another device) matches the preview strip, and its text stays readable with Auto; Hover → Glow shows a soft glow in its colours, not cut off.
6. One brush button in the top bar; with both bars its menu lists both, and each opens the right settings.
7. Presets: preview then apply, Export shows *Copied*, Import of a code from the other bar works.
8. Reload Spotify: settings kept, no `[gpb]`/`[gcb]` errors in the console.
