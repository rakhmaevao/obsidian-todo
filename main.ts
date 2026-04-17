import { RangeSetBuilder, Text, Transaction } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import {
	App,
	MarkdownPostProcessorContext,
	MarkdownView,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";

interface HighlightRule {
	keyword: string;
	backgroundColor: string;
}

interface TodoParagraphHighlighterSettings {
	rules: HighlightRule[];
}

interface FenceState {
	markerChar: string;
	markerLength: number;
}

const TEXT_COLOR = "#ffffff";
const DEFAULT_SETTINGS: TodoParagraphHighlighterSettings = {
	rules: [
		{ keyword: "TODO:", backgroundColor: "#d97706" },
		{ keyword: "ТУДУ:", backgroundColor: "#d97706" },
		{ keyword: "FIXME:", backgroundColor: "#dc2626" },
	],
};

export default class TodoParagraphHighlighterPlugin extends Plugin {
	settings: TodoParagraphHighlighterSettings = DEFAULT_SETTINGS;
	private settingsVersion = 0;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerEditorExtension([
			this.createEditorHighlightExtension(),
		]);

		this.registerMarkdownPostProcessor((element, context) => {
			this.highlightRenderedParagraphs(element, context);
		});

		this.addSettingTab(new TodoParagraphHighlighterSettingTab(this.app, this));
	}

	getRules(): HighlightRule[] {
		return normalizeRules(this.settings.rules);
	}

	getSettingsVersion(): number {
		return this.settingsVersion;
	}

	async loadSettings(): Promise<void> {
		const loaded = await this.loadData();
		this.settings = {
			...DEFAULT_SETTINGS,
			...loaded,
			rules: normalizeRules(loaded?.rules ?? DEFAULT_SETTINGS.rules),
		};
	}

	async saveSettings(): Promise<void> {
		this.settings.rules = normalizeRules(this.settings.rules);
		this.settingsVersion += 1;
		await this.saveData(this.settings);
		this.refreshOpenViews();
	}

	private createEditorHighlightExtension() {
		const plugin = this;

		return ViewPlugin.fromClass(class {
			decorations: DecorationSet;
			private lastSettingsVersion: number;

			constructor(view: EditorView) {
				this.lastSettingsVersion = plugin.getSettingsVersion();
				this.decorations = buildEditorDecorations(view, plugin.getRules());
			}

			update(update: ViewUpdate) {
				const currentVersion = plugin.getSettingsVersion();
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.geometryChanged ||
					update.focusChanged ||
					this.lastSettingsVersion !== currentVersion
				) {
					this.lastSettingsVersion = currentVersion;
					this.decorations = buildEditorDecorations(update.view, plugin.getRules());
				}
			}
		}, {
			decorations: (value) => value.decorations,
		});
	}

	private highlightRenderedParagraphs(element: HTMLElement, _context: MarkdownPostProcessorContext): void {
		for (const paragraph of Array.from(element.querySelectorAll("p"))) {
			if (!(paragraph instanceof HTMLElement)) {
				continue;
			}

			if (paragraph.closest("blockquote, li, pre")) {
				continue;
			}

			const text = paragraph.textContent ?? "";
			const rule = findMatchingRule(text, this.getRules());
			if (!rule) {
				continue;
			}

			paragraph.addClass("todo-paragraph-highlight");
			paragraph.style.setProperty("--todo-paragraph-bg", normalizeColor(rule.backgroundColor));
			paragraph.style.setProperty("--todo-paragraph-fg", TEXT_COLOR);
		}
	}

	private refreshOpenViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) {
				continue;
			}

			const cm = (view.editor as { cm?: EditorView } | undefined)?.cm;
			if (cm) {
				cm.dispatch({
					annotations: Transaction.userEvent.of("obsidian-todo:settings-changed"),
				});
			}

			(view.previewMode as { rerender?: (force?: boolean) => void } | undefined)?.rerender?.(true);
		}
	}
}

class TodoParagraphHighlighterSettingTab extends PluginSettingTab {
	plugin: TodoParagraphHighlighterPlugin;

	constructor(app: App, plugin: TodoParagraphHighlighterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Obsidian TODO" });
		containerEl.createEl("p", {
			text: "Highlight markdown paragraphs that start with configured keywords.",
		});

		const rules = this.plugin.settings.rules;
		rules.forEach((rule, index) => {
			const setting = new Setting(containerEl)
				.setName(`Rule ${index + 1}`)
				.setDesc("Keyword must match the paragraph start exactly.");

			setting.addText((text) => {
				text
					.setPlaceholder("TODO:")
					.setValue(rule.keyword)
					.onChange(async (value) => {
						this.plugin.settings.rules[index].keyword = value;
						await this.plugin.saveSettings();
					});
			});

			setting.addColorPicker((color) => {
				color
					.setValue(normalizeColor(rule.backgroundColor))
					.onChange(async (value) => {
						this.plugin.settings.rules[index].backgroundColor = normalizeColor(value);
						await this.plugin.saveSettings();
					});
			});

			setting.addExtraButton((button) => {
				button
					.setIcon("trash")
					.setTooltip("Delete rule")
					.onClick(async () => {
						this.plugin.settings.rules.splice(index, 1);
						await this.plugin.saveSettings();
						this.display();
					});
			});
		});

		new Setting(containerEl)
			.setName("Add rule")
			.setDesc("Create a new keyword and background color pair.")
			.addButton((button) => {
				button
					.setButtonText("Add")
					.onClick(async () => {
						this.plugin.settings.rules.push({
							keyword: "TODO:",
							backgroundColor: "#d97706",
						});
						await this.plugin.saveSettings();
						this.display();
					});
			});
	}
}

function buildEditorDecorations(view: EditorView, rules: HighlightRule[]): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const doc = view.state.doc;
	const matches = findHighlightParagraphs(doc, rules);

	for (const match of matches) {
		for (let index = 0; index < match.lineNumbers.length; index += 1) {
			const lineNumber = match.lineNumbers[index];
			const line = doc.line(lineNumber);
			const classes = ["todo-paragraph-highlight"];

			if (index === 0) {
				classes.push("todo-paragraph-start");
			}

			if (index === match.lineNumbers.length - 1) {
				classes.push("todo-paragraph-end");
			}

			builder.add(line.from, line.from, Decoration.line({
				attributes: {
					class: classes.join(" "),
					style: buildStyleAttribute(match.rule.backgroundColor),
				},
			}));
		}
	}

	return builder.finish();
}

function findHighlightParagraphs(doc: Text, rules: HighlightRule[]) {
	const matches: Array<{ lineNumbers: number[]; rule: HighlightRule }> = [];
	let lineNumber = 1;
	let inFrontmatter = isFrontmatterStart(doc, lineNumber);
	let activeFence: FenceState | null = null;

	while (lineNumber <= doc.lines) {
		const line = doc.line(lineNumber).text;
		const trimmed = line.trim();

		if (inFrontmatter) {
			if (lineNumber > 1 && (trimmed === "---" || trimmed === "...")) {
				inFrontmatter = false;
			}
			lineNumber += 1;
			continue;
		}

		if (activeFence) {
			if (isFenceClose(trimmed, activeFence)) {
				activeFence = null;
			}
			lineNumber += 1;
			continue;
		}

		const openingFence = parseFenceOpen(trimmed);
		if (openingFence) {
			activeFence = openingFence;
			lineNumber += 1;
			continue;
		}

		if (isBlankLine(line)) {
			lineNumber += 1;
			continue;
		}

		if (isParagraphBoundary(line)) {
			lineNumber += 1;
			continue;
		}

		const paragraphLines = [lineNumber];
		let cursor = lineNumber + 1;
		while (cursor <= doc.lines) {
			const current = doc.line(cursor).text;

			if (isBlankLine(current) || isParagraphBoundary(current)) {
				break;
			}

			if (parseFenceOpen(current.trim())) {
				break;
			}

			paragraphLines.push(cursor);
			cursor += 1;
		}

		const rule = findMatchingRule(line, rules);
		if (rule) {
			matches.push({ lineNumbers: paragraphLines, rule });
		}

		lineNumber = cursor;
	}

	return matches;
}

function normalizeRules(rules: HighlightRule[]): HighlightRule[] {
	return rules
		.map((rule) => ({
			keyword: (rule.keyword ?? "").trim(),
			backgroundColor: normalizeColor(rule.backgroundColor),
		}))
		.filter((rule) => rule.keyword.length > 0);
}

function findMatchingRule(text: string, rules: HighlightRule[]): HighlightRule | null {
	for (const rule of sortRulesBySpecificity(rules)) {
		if (text.startsWith(rule.keyword)) {
			return rule;
		}
	}

	return null;
}

function sortRulesBySpecificity(rules: HighlightRule[]): HighlightRule[] {
	return [...rules].sort((left, right) => right.keyword.length - left.keyword.length);
}

function buildStyleAttribute(backgroundColor: string): string {
	const normalizedColor = normalizeColor(backgroundColor);
	return `--todo-paragraph-bg: ${normalizedColor}; --todo-paragraph-bg-active: ${darkenColor(normalizedColor, 0.14)}; --todo-paragraph-fg: ${TEXT_COLOR};`;
}

function normalizeColor(color: string): string {
	const value = (color ?? "").trim();
	return value.length > 0 ? value : "#d97706";
}

function darkenColor(color: string, amount: number): string {
	const normalized = normalizeColor(color);
	const hexMatch = normalized.match(/^#([0-9a-fA-F]{6})$/);
	if (!hexMatch) {
		return normalized;
	}

	const hex = hexMatch[1];
	const channels = [0, 2, 4].map((index) => {
		const channel = Number.parseInt(hex.slice(index, index + 2), 16);
		return Math.max(0, Math.round(channel * (1 - amount)));
	});

	return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function isBlankLine(line: string): boolean {
	return line.trim().length === 0;
}

function isFrontmatterStart(doc: Text, lineNumber: number): boolean {
	if (lineNumber !== 1 || doc.lines === 0) {
		return false;
	}

	return doc.line(1).text.trim() === "---";
}

function parseFenceOpen(trimmedLine: string): FenceState | null {
	const match = trimmedLine.match(/^([`~]{3,})/);
	if (!match) {
		return null;
	}

	return {
		markerChar: match[1][0],
		markerLength: match[1].length,
	};
}

function isFenceClose(trimmedLine: string, fence: FenceState): boolean {
	const pattern = new RegExp(`^\\${fence.markerChar}{${fence.markerLength},}\\s*$`);
	return pattern.test(trimmedLine);
}

function isParagraphBoundary(line: string): boolean {
	const trimmed = line.trimStart();

	if (trimmed.length === 0) {
		return true;
	}

	if (/^#{1,6}\s/.test(trimmed)) {
		return true;
	}

	if (/^>/.test(trimmed)) {
		return true;
	}

	if (/^[-*+]\s+\[[ xX]\]\s+/.test(trimmed)) {
		return true;
	}

	if (/^[-*+]\s+/.test(trimmed)) {
		return true;
	}

	if (/^\d+[.)]\s+/.test(trimmed)) {
		return true;
	}

	if (/^([`~]{3,})/.test(trimmed)) {
		return true;
	}

	if (/^\s{4,}/.test(line) || /^\t/.test(line)) {
		return true;
	}

	if (/^---\s*$/.test(trimmed) || /^\*\*\*\s*$/.test(trimmed) || /^___\s*$/.test(trimmed)) {
		return true;
	}

	return false;
}
