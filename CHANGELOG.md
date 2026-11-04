# Changelog

Releases are tagged per extension (`gpb-v…`, `gcb-v…`, `gb-v…`). Older releases are in the old repos' changelogs: [Gradient Progress Bar](https://github.com/VoidCrowned/spicetify-gradient-progress-bar/blob/main/CHANGELOG.md) (up to v1.7.0) and [Gradient Connect Bar](https://github.com/VoidCrowned/spicetify-gradient-connect-bar/blob/main/CHANGELOG.md) (v1.0.0).

## Unreleased

- Both extensions now live in this repo and share their code ([#1](https://github.com/VoidCrowned/spicetify-gradient-bars/issues/1)). Nothing changes for you: same settings, same behaviour.
- New: **Gradient Bars**, both bars in one file. If a separate copy is installed too, the second one steps aside with one warning.
- The self-tests print a one-line summary plus any failures, and copy that; `selfTest({ full: true })` copies the full JSON report.
