#!/usr/bin/env bash
# Ryuk helper. Run from the folder that contains this file and ryuk@desktop-companion/
set -euo pipefail
UUID="ryuk@desktop-companion"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/$UUID"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

count_sprites() { ls "$1"/shime*.png 2>/dev/null | wc -l; }

case "${1:-help}" in
install)    # ./ryuk.sh install            (uses the sprites bundled in the repo, apple frames included)
            # ./ryuk.sh install my.zip     (optional: rebuild the sprites from a Shimeji-ee style zip)
    mkdir -p "$DEST/img"
    cp -r "$SRC/." "$DEST/"
    if [ -n "${2:-}" ]; then
        [ -f "$2" ] || { echo "Zip not found: $2"; exit 1; }
        python3 - "$2" "$DEST/img" <<'PY'
import sys, zipfile, os, re
z, out = sys.argv[1], sys.argv[2]
n = 0
with zipfile.ZipFile(z) as zf:
    for name in zf.namelist():
        base = os.path.basename(name)
        if re.fullmatch(r"shime\w+\.png", base) and "/img/" in "/" + name:
            with open(os.path.join(out, base), "wb") as f:
                f.write(zf.read(name))
            n += 1
print(f"extracted {n} sprites")
if n < 60:
    sys.exit("expected about 64 sprites; wrong zip?")
PY
        if [ "${RYUK_RAW:-0}" = "1" ]; then echo "RYUK_RAW=1: sprites left exactly as shipped"; else python3 "$HERE/tools/clean-sprites.py" "$DEST/img"; fi
        # apple-eating frames: built from the (cleaned) standing pose, so they match the rest of the sprites
        python3 -c "import PIL, numpy" 2>/dev/null || { echo "Needs Pillow and NumPy: sudo dnf install python3-pillow python3-numpy"; exit 1; }
        python3 "$HERE/tools/make-eat-frames.py" "$DEST/img" "$DEST/img"
    fi
    [ "$(count_sprites "$DEST/img")" -ge 60 ] || { echo "No sprites found in $DEST/img. Add them to $SRC/img or pass a sprite zip."; exit 1; }
    glib-compile-schemas "$DEST/schemas"
    echo "Installed to $DEST"
    echo "If this is the first install on Wayland: log out and back in once, then: ./ryuk.sh start"
    ;;
pack)       # ./ryuk.sh pack 0.1.0  -> dist/ryuk-v0.1.0.zip + dist/SHA256SUMS
    VER="${2:?usage: ./ryuk.sh pack 0.1.0}"
    [ "$(count_sprites "$SRC/img")" -ge 60 ] || { echo "Put the sprites in $SRC/img first"; exit 1; }
    echo "Extra (non-shime*.png) files going into the package, these should be your apple frames:"
    ls "$SRC/img" | grep -v -E '^shime[A-Za-z0-9]*\.png$' || echo "  (none: apple frames missing? copy them into $SRC/img)"
    STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
    cp -r "$SRC/." "$STAGE/"
    find "$STAGE" -name '__pycache__' -prune -exec rm -rf {} + 2>/dev/null || true
    glib-compile-schemas "$STAGE/schemas"
    mkdir -p "$HERE/dist"
    python3 - "$STAGE" "$HERE/dist/ryuk-v$VER.zip" "$VER" <<'PY'
import sys, os, json, zipfile
stage, out, ver = sys.argv[1:4]
meta = os.path.join(stage, "metadata.json")
m = json.load(open(meta)); m["version-name"] = ver
json.dump(m, open(meta, "w"), indent=2)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(stage):
        for f in sorted(files):
            p = os.path.join(root, f)
            z.write(p, os.path.relpath(p, stage))
print("wrote", out)
PY
    (cd "$HERE/dist" && sha256sum "ryuk-v$VER.zip" > SHA256SUMS && cat SHA256SUMS)
    ;;
start)   gnome-extensions enable "$UUID"; echo "Ryuk started." ;;
stop)    gnome-extensions disable "$UUID"; echo "Ryuk stopped." ;;
status)  gnome-extensions info "$UUID" ;;
logs)    journalctl --user -b --no-pager | grep -i -E "ryuk|$UUID" | tail -40 || true ;;
test)    node "$HERE/tools/test-engine.mjs" ;;
uninstall)
    gnome-extensions disable "$UUID" 2>/dev/null || true
    rm -rf "$DEST"
    dconf reset -f /org/gnome/shell/extensions/ryuk/ 2>/dev/null || true
    echo "Ryuk removed." ;;
*) echo "usage: ./ryuk.sh install [sprites.zip] | pack <version> | start | stop | status | logs | test | uninstall" ;;
esac