# Obsidian TODO

Obsidian plugin that highlights markdown paragraphs starting with configured keywords such as `TODO:` or `FIXME:`. Helps keep action items visible across Reading View, Source Mode, and Live Preview.

## Features
- Paragraph-level highlighting in all three view modes:
  - Reading View
  - Source Mode
  - Live Preview
- Matches only paragraphs whose **first line** starts with a configured keyword.
- Ignores:
  - fenced code blocks (` ``` ` and `~~~`)
  - inline code
  - blockquotes
  - bullet, ordered, and task lists
  - YAML frontmatter
- Configurable rules in the plugin settings:
  - keyword (exact match, case-sensitive)
  - background color
- Text color is chosen automatically for readability against the background (WCAG contrast aware).
- Rules can be reordered, added, and deleted from the settings tab.

## Default rules
- `TODO:` — orange (`#ffbd2a`)
- `ТУДУ:` — orange (`#ffbd2a`)
- `FIXME:` — pink-red (`#f06292`)

## Installation (manual)
1. Build the plugin locally:
   ```sh
   npm install
   npm run build
   ```
2. Create a plugin folder named exactly `obsidian-todo` inside your vault's `.obsidian/plugins/` directory.
3. Copy these files into `.obsidian/plugins/obsidian-todo/`:
   - `manifest.json`
   - `main.js`
   - `styles.css`
4. Reload Obsidian and enable the plugin under Community Plugins.

You can also run `make prepare-plugin-for-installation` to stage these files into the local `obsidian-todo/` folder.

## Settings
Open the plugin settings tab to edit the list of rules. Each rule has:
- keyword — matched exactly at the paragraph start
- background color — color picker, hex

If two rules share the same keyword, the plugin warns in the description line and the earlier rule wins.

## Notes
- Keyword matching is case-sensitive. Add separate rules for `TODO` and `todo` if you want both.
- Inline highlighting (mid-paragraph) is intentionally out of scope.
- The active editor line uses a slightly darker shade of the chosen color for better focus visibility.

## Development
- `npm run dev` — starts esbuild in watch mode.
- `npm run build` — runs TypeScript type-check and produces a production bundle.
- `make prepare-plugin-for-installation` — copies `manifest.json`, `main.js`, and `styles.css` into `obsidian-todo/` for installation testing.

## License
MIT
