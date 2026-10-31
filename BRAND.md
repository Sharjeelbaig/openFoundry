# openFoundry brand

## The mark

The symbol is a **half-cast F**: the letterform is cut from an ivory face, with a
copper spine running down the stem. The copper reads as a pour seam, the F identifies
Foundry, and the open negative spaces keep the mark light rather than filling a tile
with decoration.

It is intentionally not a sparkle, robot, brain or circuit. Those are generic AI
signals; this mark belongs to a local workshop.

## Lockup

The primary lockup is the mark followed by the wordmark:

```text
[mark] openFoundry
```

- `open` is the quieter word, in the secondary text colour.
- `Foundry` is the anchor, in the primary text colour and semibold.
- The mark and wordmark are baseline-aligned and separated by roughly half the
  mark's width.
- Do not put the wordmark inside the app tile.

## Colour

| Token | Value | Use |
| --- | --- | --- |
| Paper | `#F4EFE6` | The F face on dark surfaces |
| Copper light | `#FFC57E` | Top of the pour seam |
| Copper deep | `#D86831` | Bottom of the pour seam |
| Ink | `#141414` | App tile base |
| Warm ink | `#2B241D` | Tile highlight |

The mark is designed to work as a single colour at small sizes. Use the paper colour
for the whole F when a monochrome mark is needed.

## App tile

- Rounded square, 22.3% corner radius.
- Dark graphite field with a restrained warm glow behind the F.
- Centred F occupying roughly 52% of the width and 66% of the height.
- The source is `public/brand/openfoundry-icon.svg`.

## Clear space and minimum sizes

- Keep clear space equal to at least 25% of the mark's height on every side.
- Standalone mark: **16 px minimum**.
- Mark plus wordmark: **96 px minimum width**.
- App tile: **32 px minimum**; the simplified 16 px raster is used for favicons.

## Do not

- recolour the copper seam as a progress bar or notification badge
- rotate, skew or outline the F
- place the mark on a busy photo without the dark app tile
- use the old star/anvil artwork
- add a third colour to the mark

## Source files

```text
public/brand/openfoundry-mark.svg   transparent mark
public/brand/openfoundry-icon.svg   app tile
src-tauri/icons/                    generated desktop icons
src/app/icon.png                    web app icon
src/app/favicon.ico                 browser favicon
```
