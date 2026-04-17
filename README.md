# Obsidian TODO

Obsidian plugin that highlights markdown paragraphs starting with configured keywords.

## Features
- Highlights paragraph starts in:
  - Reading View
  - Source Mode / Editor
  - Live Preview
- Matches only paragraphs that start with a configured keyword.
- Ignores:
  - fenced code blocks
  - inline code-only occurrences
  - blockquotes
  - bullet and ordered lists
  - markdown task lists
- Supports configurable rules in the plugin settings:
  - keyword
  - background color

## Default rules
- `TODO:` with orange background
- `ТУДУ:` with orange background
- `FIXME:` with red background

Text color is fixed to white in v1.

## Installation for development
1. Run `npm install`.
2. Run `npm run build`.
3. Create a plugin folder named exactly `obsidian-todo` inside `.obsidian/plugins/`.
4. Copy these files into `.obsidian/plugins/obsidian-todo/`:
   - `manifest.json`
   - `main.js`
   - `styles.css`
5. Reload Obsidian and enable the plugin in Community Plugins.

You can also run `make prepare-plugin-for-installation` to prepare a folder with the correct plugin id.

## Settings
Open the plugin settings tab and edit the list of rules. Each rule contains:
- keyword
- background color

Keyword matching is exact and applies only at the start of a paragraph.

## Notes
- If you want `TODO` without a colon, add a separate rule for `TODO`.
- Inline TODO highlighting is intentionally out of scope for v1.
