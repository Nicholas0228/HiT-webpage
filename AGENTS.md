# Agent instructions

Explain and write in ASD-STE100.

## Website design

Less is more. Keep the webpage clean.

### Apple-style design and SuperMimic reference

- Use Apple-style product-page design and animation as the visual direction.
- Use [SuperMimic](https://supermimic.github.io/) as the layout and interaction reference. It is a reference, not an official Apple template.
- Use large, clear typography, generous white space, white backgrounds, and a restrained layout.
- Give each screen one main visual focus. Keep text short and controls minimal.
- Use smooth, scroll-driven animation with clear start and end states. Avoid unnecessary decoration.
- Support smaller screens, keyboard scrolling, and reduced-motion preferences.
- Keep the black-text and AF3 palette rules below. The reference does not override them.
- Build only the content the user requests. Do not add later sections without a request.

## Figure text

- All figure text must be black (`#000000`). This includes labels, dimensions, equations, badges, legends, and captions.
- Do not use grey for secondary text or palette colours for emphasis.
- Set `allow_text_color: false` by default. Set `allow_text_color: true` only when the user explicitly requests coloured text.
- Keep the default figure light, even on a dark page, so black text remains readable.

## AF3 reference palette

Use the AF3 reference palette. Keep each colour's meaning fixed.

| Meaning | Colour | Hex |
| --- | --- | --- |
| `frozen` | Navy | `#233b91` |
| `train` | Orange | `#e8a446` |
| `tensor` | Sky blue | `#a5d3f2` |
| `loss` | Pink | `#be6089` |
| `target` | Green | `#489750` |
| `side` | Steel blue | `#6289ad` |
| `hard` | Orange | `#e8a446` |
| `mask` | Grey | `#c2c2c2` |

- Use white backgrounds and light fills. Keep labels black.
- Use the base colours for strokes. Mix the base colours with white for fills.
- Apply the palette to shapes and lines, not text.
- Add a legend.
- Label hard negatives explicitly when trainable blocks also use orange.
- Do not add other accent colours unless the user requests them.
