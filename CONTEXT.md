# Repository Guidelines

## Project Structure & Module Organization
This repository is a small Obsidian plugin with a single TypeScript entry point. Core logic lives in `main.ts`, bundled output is written to `main.js`, and plugin metadata is stored in `manifest.json`. UI styling lives in `styles.css`. Build configuration is in `esbuild.config.mjs`, compiler settings are in `tsconfig.json`, and `Makefile` contains the helper target used to stage installable plugin files in `obsidian-todo/`.

## Build, Test, and Development Commands
- `npm install`: install local dependencies.
- `npm run dev`: start esbuild in watch mode for local development.
- `npm run build`: run TypeScript checks and produce a production bundle in `main.js`.
- `make prepare-plugin-for-installation`: copy `manifest.json`, `main.js`, and `styles.css` into `obsidian-todo/` for manual installation into `.obsidian/plugins/`.

## Coding Style & Naming Conventions
Use TypeScript with strict typing and keep changes compatible with the existing single-file plugin layout unless a refactor is justified. Match the current formatting style:
- use tabs for indentation in `.ts` and `.css`
- use `PascalCase` for classes, `camelCase` for functions and variables, and `UPPER_SNAKE_CASE` for constants
- use descriptive interface names such as `HighlightRule`
- keep CSS class names kebab-case, for example `.todo-paragraph-highlight`

There is no dedicated formatter or linter configured, so rely on `npm run build` to catch type and bundling issues.

## Testing Guidelines
No automated test suite is configured yet. Validate changes by running `npm run build`, installing the staged plugin into an Obsidian vault, and checking behavior in Reading View, Source Mode, and Live Preview. When adding logic-heavy helpers, prefer extracting pure functions that can be covered easily if tests are introduced later.

## Commit & Pull Request Guidelines
Git history is minimal (`first commit`), so use short, imperative commit messages such as `Add paragraph rule validation` or `Refine preview highlighting`. Pull requests should include a clear summary, manual verification steps, and screenshots or short recordings for UI changes in Obsidian. Link related issues when applicable and note any plugin installation or migration steps reviewers need to follow.
