# Changelog

Releases are tagged per extension (`gpb-v…`, `gcb-v…`, `gb-v…`). Older releases are in the old repos' changelogs: [Gradient Progress Bar](https://github.com/VoidCrowned/spicetify-gradient-progress-bar/blob/main/CHANGELOG.md) (up to v1.7.0) and [Gradient Connect Bar](https://github.com/VoidCrowned/spicetify-gradient-connect-bar/blob/main/CHANGELOG.md) (v1.0.0).

## Unreleased

- New setting **Hover**: *Brighten* lights the bar up a little while you hover it; on the Connect bar, *Glow* adds a soft glow in the bar's own colours ([#3](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/3), [#8](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/8)). Off by default; presets and share codes don't include it, so applying one keeps your choice. No transition if your system asks for reduced motion.
- Self-tests never write your real settings or presets: a run uses its own keys, and leftovers from an interrupted run are removed on start-up ([#13](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/13)).
- Gradient Connect Bar's self-test skips the checks that need the Connect bar if it disappears mid-run, instead of failing them ([#14](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/14)).

## Gradient Progress Bar 1.8.0, Gradient Connect Bar 1.0.1, Gradient Bars 1.0.0 (7 Nov 2026)

- Both extensions now live in this repo and share their code ([#1](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/1)). Same settings, same behaviour.
- New: **Gradient Bars**, both bars in one file.
- Installed twice (Gradient Bars next to a separate bar, or the same file from the Marketplace and locally)? The copy that starts second steps aside with one warning, and `status()` says where the running copy came from ([#15](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/15)).
- Marketplace installs from the old repos now load the builds from this repo, so they keep getting updates.
- The self-tests print a one-line summary plus any failures, and copy that; `selfTest({ full: true })` copies the full JSON report.
- `status()` no longer says the profile-menu entry is hidden once Spicetify's menu item works again ([#6](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/6)).
- Self-test fixes: colour checks no longer read mid-transition ([#12](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/12)); the top-bar button check clicks the button itself.
