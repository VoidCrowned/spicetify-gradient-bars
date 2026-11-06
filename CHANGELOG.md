# Changelog

Releases are tagged per extension (`gpb-v…`, `gcb-v…`, `gb-v…`). Older releases are in the old repos' changelogs: [Gradient Progress Bar](https://github.com/VoidCrowned/spicetify-gradient-progress-bar/blob/main/CHANGELOG.md) (up to v1.7.0) and [Gradient Connect Bar](https://github.com/VoidCrowned/spicetify-gradient-connect-bar/blob/main/CHANGELOG.md) (v1.0.0).

## Gradient Progress Bar 1.8.0, Gradient Connect Bar 1.0.1, Gradient Bars 1.0.0 (unreleased)

- Both extensions now live in this repo and share their code ([#1](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/1)). Same settings, same behaviour.
- New: **Gradient Bars**, both bars in one file.
- Installed twice (Gradient Bars next to a separate bar, or the same file from the Marketplace and locally)? The copy that starts second steps aside with one warning, and `status()` says where the running copy came from ([#15](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/15)).
- Marketplace installs from the old repos now load the builds from this repo, so they keep getting updates.
- The self-tests print a one-line summary plus any failures, and copy that; `selfTest({ full: true })` copies the full JSON report.
- `status()` no longer says the profile-menu entry is hidden once Spicetify's menu item works again ([#6](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/6)).
- Self-test fixes: colour checks no longer read mid-transition ([#12](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/12)); the top-bar button check clicks the button itself.
