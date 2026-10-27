# Artwork and third-party material

The MIT licence in `LICENSE` covers **the source code in this repository only**.

## The bundled sprites are unofficial fan art

`ryuk@desktop-companion/img/` contains sprite images of Ryuk, a character from
*Death Note*, created by Tsugumi Ohba and Takeshi Obata. The character and its
likeness belong to their respective rights holders. The images are
AI-assisted, unofficial fan art, derived from a Shimeji pack.

They are included for convenience so the extension works out of the box.
**They are not covered by the MIT licence, and no licence or permission to
reuse or redistribute them is granted by this project.** Using or
redistributing them is at your own risk. This is a non-commercial fan project
and is not affiliated with or endorsed by the rights holders or publishers.

If you are a rights holder and want the artwork removed, open an issue or use
the private contact in `SECURITY.md` and it will be taken down promptly.

If you would rather use different art, replace the files in
`ryuk@desktop-companion/img/` or run `./ryuk.sh install your-pack.zip`.

## Format and credits

- The pose names, frame sizes and timings follow the **Shimeji-ee** sprite-pack
  format (`shimeN.png` frames, 128 px native height), created by Yuki Yamada /
  Group Finity and extended by Kilkakon and the Shimeji-ee community
  (https://kilkakon.com/shimeji). Shimeji-ee is under the New BSD licence. No
  Shimeji-ee code is included in this project. The Shimeji-ee readme asks that
  Kilkakon and the original contributors be credited; this file is that credit.
- The sprite pack was derived from a "Slushi" Shimeji pack; the original
  artist's credit is kept in that pack's own `info.xml`.
- The faint transparent haze in the original frames is removed by
  `tools/clean-sprites.py`; the artwork pixels themselves are not edited.

## Bundled third-party code

None. The extension uses only GNOME Shell, GLib, GTK4 and libadwaita APIs
provided by the system.