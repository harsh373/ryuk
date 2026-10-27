# Contributing

Thanks for helping. Small fixes, bug reports and ideas are all welcome.

## Before you start

- Open an issue first for anything bigger than a small fix, so we can agree on it.
- Keep Ryuk calm: slow movement, no hunger meters, XP or other game mechanics.
- No network access, no accounts, and no second startup mechanism.
- New artwork must be art you have the right to share. See ASSETS.md.

## Setup

```bash
git clone https://github.com/harsh373/ryuk.git
cd ryuk
./ryuk.sh test      # engine tests, needs Node 18+
```

To try your changes in GNOME: `./ryuk.sh install`, log out and in, then
`./ryuk.sh start`. Use `./ryuk.sh logs` to see errors. GNOME keeps old extension
code loaded until you log in again, so a relogin is needed after each code change.

## Code layout

- `lib/config.js`: all numbers and animation data
- `lib/behaviors.js`: choosing what he does next
- `lib/engine.js`: movement, physics, state machine. No GNOME imports, so it
  stays testable under Node.
- `lib/sprite.js`: drawing. `extension.js`: timer, menu, settings, dragging.
- `prefs.js`: settings window
- `tools/`: sprite cleaning, apple-frame generation and the engine tests
- `ryuk.sh`: install, pack, start, stop, logs, test

Keep behaviour parameters in `config.js` instead of scattering numbers.

## Pull requests

- One change per PR, with a short description of what and why.
- Run `./ryuk.sh test` and say which GNOME version and session you tried the
  GNOME-side change on. Untested GUI changes should say so.
- Do not commit personal files or logs with private paths.

## Bug reports

Use the bug report template. It asks for your OS, GNOME Shell version, session
type (Wayland or X11), how you installed, steps to reproduce, and the output of
`gnome-extensions info ryuk@desktop-companion` and `./ryuk.sh logs`.