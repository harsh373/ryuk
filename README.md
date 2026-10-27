# Ryuk for GNOME

A small, slow Ryuk who wanders around your whole GNOME desktop: over Firefox,
VS Code, the terminal, everything. I was watching Death Note, wanted Ryuk
walking around my Fedora desktop, couldn't find one I liked, and built it.

It is a GNOME Shell extension. It works offline, has no account or login, and
does not start by itself when you log in.

![Ryuk on the desktop](docs/image1.png)

**Download:** [latest release](https://github.com/harsh373/ryuk/releases/latest) ·
**Report a bug:** [issues](https://github.com/harsh373/ryuk/issues)

## What he does

- Walks, stands, looks around, sits, dangles his legs, draws, checks his phone
  and sleeps, mostly slowly and mostly doing nothing
- Climbs the screen edges and the ceiling, and sometimes jumps (both can be
  turned off)
- You can pick him up and drop him with the mouse; he falls and lands
- Feed him an apple from the top-bar menu and he eats it
- Optional: stay visible over fullscreen windows (off by default)
- Speed, behaviour frequency and size are adjustable; pause and hide any time
- Panel menu plus a preferences window; settings persist
- Idle cost is low: the timer wakes about 3 times a second when he is standing
  still and 25 times a second when he moves

## Tested on

| OS | GNOME Shell | Session | Result |
|---|---|---|---|
| Fedora Workstation 43 | 49.1 | Wayland | works (author's machine) |

Anything else is **untested**. `metadata.json` only lists GNOME Shell 49, so
older or newer versions will refuse to load it. X11 is not tested.

## Requirements

- GNOME Shell 49 and the `gnome-extensions` command (comes with it)
- For the git install only: `python3` and `glib-compile-schemas` (on Fedora this
  normally comes with `glib2-devel`)
- Optional: `python3-pillow` and `python3-numpy`, only needed if you rebuild the
  sprites from your own sprite zip

## Install

### Option 1: release zip (easiest)

Download `ryuk-vX.Y.Z.zip` and `SHA256SUMS` from the
[Releases page](https://github.com/harsh373/ryuk/releases), then:

```bash
sha256sum -c SHA256SUMS                              # check the download is intact
gnome-extensions install --force ryuk-vX.Y.Z.zip     # installs for your user only
```

The first time, log out and back in once (Wayland only loads new extensions at
login). Then:

```bash
gnome-extensions enable ryuk@desktop-companion
```

### Option 2: from git

```bash
git clone https://github.com/harsh373/ryuk.git
cd ryuk
chmod +x ryuk.sh tools/clean-sprites.py
./ryuk.sh install
```

Log out and in once, then `./ryuk.sh start`. Other commands: `./ryuk.sh stop`,
`status`, `logs`. You can also use the devil-face icon in the top bar; "Exit
Ryuk" in its menu turns the extension off.

### Does he start at login?

No. GNOME remembers enabled extensions, so Ryuk turns himself off again if he is
enabled within about 20 seconds of the shell starting. If you want him to start
with your session, turn on "Keep running across logins" in the preferences.
This check is a heuristic and has only been tried on the author's machine.

## Update

Option 1: run `gnome-extensions install --force` with the new zip. Option 2:
`git pull` and `./ryuk.sh install`. Then log out and in. Your settings are
stored by GNOME (dconf) and are kept.

## Uninstall

Option 1:
```bash
gnome-extensions uninstall ryuk@desktop-companion
dconf reset -f /org/gnome/shell/extensions/ryuk/     # optional: also forget settings
```
Option 2: `./ryuk.sh uninstall` (does both).

## Configure

Use the top-bar menu (speed, behaviours, "Make him do...", toggles) or
Preferences. To change numbers such as walking speed, behaviour weights and
cooldowns, edit `ryuk@desktop-companion/lib/config.js`, reinstall and log out
and in again (GNOME keeps old extension code loaded until then).

## Troubleshooting

- **Nothing appears / State: ERROR:** run `gnome-extensions info
  ryuk@desktop-companion` and `./ryuk.sh logs` (or `journalctl --user -b | grep
  -i ryuk`). A "No such file" import error means a file is missing from the
  install: reinstall.
- **Extension not found:** log out and back in once after the first install.
- **He hides during fullscreen:** that is the default; turn on "Show over
  fullscreen". While he is shown over a fullscreen video, GNOME may stop its
  direct-scanout optimisation, which can cost a little performance.
- **Odd poses while climbing or jumping:** poses are mapped from the sprite
  pack's own animation file and may look rough.

Still stuck? [Open an issue](https://github.com/harsh373/ryuk/issues/new/choose)
and fill in the template (OS, GNOME version, session type, logs).

## Development

Needs Node 18+ for the tests. The movement engine (`lib/engine.js`,
`lib/behaviors.js`, `lib/config.js`) has no GNOME imports and runs under Node:

```bash
./ryuk.sh test
```

That runs `tools/test-engine.mjs`, which simulates movement and checks the
engine's behaviour. **It does not test the GNOME part** (`extension.js`,
`lib/sprite.js`, `prefs.js`); that is checked by hand on a real session. Build a
release zip with `./ryuk.sh pack 0.1.0` (writes `dist/`). See
[CONTRIBUTING.md](CONTRIBUTING.md).

## Known limitations

- GNOME Shell 49 only, tested on Fedora 43 / Wayland only
- He lives on the floor, walls and ceiling of one monitor's work area. He does
  not walk on top of windows. You can drag him to another monitor.
- Hidden in the Activities overview
- The sprites are unofficial fan art with unclear redistribution rights, see
  [ASSETS.md](ASSETS.md)

## Credits

- Ryuk and Death Note: Tsugumi Ohba and Takeshi Obata. This is an unofficial
  fan project, not affiliated with or endorsed by them or their publishers.
- Sprite/animation format: Shimeji-ee by Group Finity, Kilkakon and community
  (https://kilkakon.com/shimeji). See [ASSETS.md](ASSETS.md).

## Licence

Code: MIT, see [LICENSE](LICENSE). The artwork is not covered by it, see
[ASSETS.md](ASSETS.md).