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

### Shared glass UI

- Use one shared control system in `dist/ui-glass.css`.
- Use black, white, and grey for interface surfaces and animation effects.
- Use the macOS Liquid Glass style for controls: light translucent fills, a thin rim, and a soft shadow.
- Use the same shape and selected state for buttons, tabs, menus, and image selectors.
- Keep glass effects in the control layer. Keep images, plots, and data maps clear.
- Keep the AF3 data colors and caption weight colors. Do not apply a grey filter to data visuals.
- Keep text black and use the shared regular text size.
- Keep keyboard focus clear. Support reduced motion and reduced transparency.
- Reference: [Apple materials](https://developer.apple.com/design/human-interface-guidelines/materials).

### Shared text size

- Apply this rule to every page, section, figure, and interactive viewer.
- Use one shared font size for all regular text. This includes paragraphs, captions, annotations, notes, footnotes, legends, axis labels, tooltips, and control labels.
- Do not make captions, notes, instructions, or other secondary text smaller than paragraphs.
- Only titles, headings, subtitles, and highlights can use different font sizes.
- The large `256 → 110` values are a highlight. The labels `image patches` and `image groups` must use the shared regular text size.
- Define the regular text size once with a shared CSS variable. Use it in all components.
- If the size changes for a smaller screen, change the shared value for all regular text together. Do not add separate sizes for individual components.

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
