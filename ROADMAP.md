# Roadmap

Mirrors the [milestones](https://github.com/VoidCrowned/spicetify-gradient-bars/milestones). Issues are the source of truth; this file follows them.

## Done: one repo for both bars (7 Nov 2026)

Tracking: [#1](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/1). Gradient Progress Bar and Gradient Connect Bar move here with their shared code in one place, plus Gradient Bars, which runs both from one file. Behaviour stays the same.

| Step | Status |
|---|---|
| Shared code in `src/shared/`, esbuild build, CI and CDN workflows | ✅ |
| Gradient Bars (`dist/gradientBars.js`, `__gb`), conflict rule for double installs | ✅ |
| Self-tests print a summary; `selfTest({ full: true })` copies the JSON | ✅ |
| Manifest, README, this roadmap; open issues moved | ✅ |
| Duplicate guard, load origin, old repos forward here ([#15](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/15)) | ✅ |
| Releases GPB 1.8.0, GCB 1.0.1, GB 1.0.0, then the Marketplace ([#16](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/16)) | ✅ (7 Nov 2026) |
| Old repos archived | ✅ |

## Future

Agreed ideas, not scheduled. Tracking: [#10](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/10).

| # | Issue | Bar |
|---|---|---|
| [#2](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/2) | Custom stop positions on the progress bar | GPB |
| [#3](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/3) | Hover effect option for the progress bar | GPB |
| [#4](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/4) | Opt-in colours for the track and the volume bar | GPB |
| [#5](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/5) | Anchored: handle takes the colour under the playhead | GPB |
| [#7](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/7) | Connect bar: mirror the song progress | GCB |
| [#8](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/8) | Hover effect for the Connect bar | GCB |
| [#9](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/9) | Custom stop positions on the Connect bar | GCB |
| [#11](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/11) | One settings window for Gradient Bars | GB |

Open bugs without a milestone: none.

## Not planned

| Idea | Why |
|---|---|
| Gradient direction / angle ([GPB #16](https://github.com/VoidCrowned/spicetify-gradient-progress-bar/issues/16), [GCB #27](https://github.com/VoidCrowned/spicetify-gradient-connect-bar/issues/27)) | The bars are only a few pixels tall, so any angle other than left → right is barely visible. |
| Per-colour opacity ([GPB #17](https://github.com/VoidCrowned/spicetify-gradient-progress-bar/issues/17), [GCB #26](https://github.com/VoidCrowned/spicetify-gradient-connect-bar/issues/26)) | A darker or lighter colour gives the same look without semi-transparent stops. Colours stay opaque. |
| Own settings button outside Spicetify's menus ([GPB #29](https://github.com/VoidCrowned/spicetify-gradient-progress-bar/issues/29)) | Right-click on a bar always works, and the top-bar button and profile menu show wherever Spicetify can render them. |

## Released

Before this repo, each bar had its own. Full history in the old roadmaps.

| Extension | Releases | History |
|---|---|---|
| Gradient Progress Bar | v1.0.0 (13 Oct 2026) … v1.7.0 (19 Oct 2026): Compress/Anchored/Slide, keyboard reordering, the −\|+ stepper, presets and share codes, the shared top-bar button | [roadmap](https://github.com/VoidCrowned/spicetify-gradient-progress-bar/blob/main/ROADMAP.md), [changelog](https://github.com/VoidCrowned/spicetify-gradient-progress-bar/blob/main/CHANGELOG.md) |
| Gradient Connect Bar | v1.0.0 (19 Oct 2026): GPB's editor on the Connect bar, text colour, presets, share codes, the shared top-bar button | [roadmap](https://github.com/VoidCrowned/spicetify-gradient-connect-bar/blob/main/ROADMAP.md), [changelog](https://github.com/VoidCrowned/spicetify-gradient-connect-bar/blob/main/CHANGELOG.md) |
| All three, from this repo | [GPB 1.8.0](https://github.com/VoidCrowned/spicetify-gradient-bars/releases/tag/gpb-v1.8.0), [GCB 1.0.1](https://github.com/VoidCrowned/spicetify-gradient-bars/releases/tag/gcb-v1.0.1), [GB 1.0.0](https://github.com/VoidCrowned/spicetify-gradient-bars/releases/tag/gb-v1.0.0) (7 Nov 2026): one repo, Gradient Bars, the duplicate guard, old-repo installs forward here | [changelog](CHANGELOG.md) |
