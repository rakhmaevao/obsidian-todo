import { RangeSetBuilder, Text } from "@codemirror/state";
import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
} from "@codemirror/view";
import {
	App,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	debounce,
} from "obsidian";

interface HighlightRule {
	id: string;
	keyword: string;
	backgroundColor: string;
	textColor: string;
}

interface TodoParagraphHighlighterSettings {
	rules: HighlightRule[];
}

interface FenceState {
	markerChar: string;
	markerLength: number;
}

interface RuleMatch {
	lineNumbers: number[];
	rule: HighlightRule;
}

const DEFAULT_BACKGROUND = "#ffbd2a";
const DEFAULT_TEXT_COLOR = "#ffffff";
const SAVE_DEBOUNCE_MS = 300;
const STYLE_ELEMENT_ID = "todo-paragraph-highlighter-rules";

function createRuleId(): string {
	const random = Math.random().toString(36).slice(2, 10);
	const time = Date.now().toString(36);
	return `r-${random}${time}`;
}

function createDefaultRules(): HighlightRule[] {
	return [
		{
			id: createRuleId(),
			keyword: "TODO:",
			backgroundColor: "#ffbd2a",
			textColor: DEFAULT_TEXT_COLOR,
		},
		{
			id: createRuleId(),
			keyword: "ТУДУ:",
			backgroundColor: "#ffbd2a",
			textColor: DEFAULT_TEXT_COLOR,
		},
		{
			id: createRuleId(),
			keyword: "FIXME:",
			backgroundColor: "#f06292",
			textColor: DEFAULT_TEXT_COLOR,
		},
	];
}

function createDefaultSettings(): TodoParagraphHighlighterSettings {
	return { rules: createDefaultRules() };
}

export default class TodoParagraphHighlighterPlugin extends Plugin {
	settings: TodoParagraphHighlighterSettings = createDefaultSettings();
	private sortedRules: HighlightRule[] = [];
	private styleEl: HTMLStyleElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.mountStyleElement();
		this.refreshRuleCache();

		this.registerEditorExtension(this.buildEditorExtension());
		this.registerMarkdownPostProcessor((element) =>
			this.highlightRenderedParagraphs(element),
		);
		this.addSettingTab(new TodoHighlighterSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		try {
			const loaded = (await this.loadData()) as unknown;
			this.settings = coerceSettings(loaded);
		} catch (error) {
			console.error(
				"[obsidian-todo] failed to load settings, falling back to defaults",
				error,
			);
			this.settings = createDefaultSettings();
		}
	}

	async saveSettings(): Promise<void> {
		const sanitized = sanitizeRules(this.settings.rules);
		try {
			await this.saveData({ rules: sanitized });
		} catch (error) {
			console.error("[obsidian-todo] failed to save settings", error);
			new Notice(
				"Obsidian TODO: failed to save settings. See developer console for details.",
			);
			return;
		}
		this.refreshRuleCache();
		this.app.workspace.updateOptions();
		this.restyleRenderedParagraphs();
	}

	getSortedRules(): HighlightRule[] {
		return this.sortedRules;
	}

	private mountStyleElement(): void {
		const el = document.createElement("style");
		el.id = STYLE_ELEMENT_ID;
		document.head.appendChild(el);
		this.styleEl = el;
		this.register(() => {
			el.remove();
			this.styleEl = null;
		});
	}

	private refreshRuleCache(): void {
		const effective = sanitizeRules(this.settings.rules);
		this.sortedRules = [...effective].sort(
			(a, b) => b.keyword.length - a.keyword.length,
		);
		this.writeRuleStylesheet(this.sortedRules);
	}

	private writeRuleStylesheet(rules: HighlightRule[]): void {
		if (!this.styleEl) {
			return;
		}
		const css = rules.map(renderRuleCss).join("\n\n");
		this.styleEl.textContent = css;
	}

	private highlightRenderedParagraphs(element: HTMLElement): void {
		applyHighlightToParagraphs(
			Array.from(element.querySelectorAll("p")),
			this.sortedRules,
		);
	}

	private restyleRenderedParagraphs(): void {
		const container = this.app.workspace.containerEl;
		const paragraphs = Array.from(
			container.querySelectorAll<HTMLElement>(".markdown-rendered p"),
		);
		applyHighlightToParagraphs(paragraphs, this.sortedRules);
	}

	private buildEditorExtension() {
		const plugin = this;
		return ViewPlugin.fromClass(
			class {
				decorations: DecorationSet;

				constructor(view: EditorView) {
					this.decorations = buildEditorDecorations(
						view,
						plugin.getSortedRules(),
					);
				}

				update(update: ViewUpdate) {
					if (update.docChanged || update.viewportChanged) {
						this.decorations = buildEditorDecorations(
							update.view,
							plugin.getSortedRules(),
						);
					}
				}
			},
			{
				decorations: (value) => value.decorations,
			},
		);
	}
}

class TodoHighlighterSettingTab extends PluginSettingTab {
	plugin: TodoParagraphHighlighterPlugin;
	private readonly scheduleSave = debounce(
		() => void this.plugin.saveSettings(),
		SAVE_DEBOUNCE_MS,
		true,
	);

	constructor(app: App, plugin: TodoParagraphHighlighterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Highlight rules").setHeading();
		containerEl.createEl("p", {
			text:
				"Paragraphs beginning with one of the keywords below will be highlighted " +
				"with the chosen background and text colors. Matching is exact and case-sensitive.",
			cls: "setting-item-description",
		});

		this.renderRuleRows(containerEl);

		new Setting(containerEl).addButton((button) => {
			button
				.setButtonText("Add rule")
				.setCta()
				.onClick(async () => {
					this.plugin.settings.rules.push({
						id: createRuleId(),
						keyword: "TODO:",
						backgroundColor: DEFAULT_BACKGROUND,
						textColor: DEFAULT_TEXT_COLOR,
					});
					await this.plugin.saveSettings();
					this.display();
				});
		});
	}

	hide(): void {
		this.scheduleSave.run();
	}

	private renderRuleRows(container: HTMLElement): void {
		const rules = this.plugin.settings.rules;
		const duplicateKeywords = findDuplicateKeywords(rules);

		rules.forEach((rule, index) => {
			const setting = new Setting(container);
			setting.setName(rule.keyword.trim() || "New rule");

			if (rule.keyword.trim() === "") {
				setting.setDesc(
					"Enter a keyword – empty rules are skipped when saving.",
				);
			} else if (duplicateKeywords.has(rule.keyword.trim())) {
				setting.setDesc(
					"Duplicate keyword: earlier rules with the same keyword take priority.",
				);
			} else {
				setting.setDesc("Matches paragraphs that start with this keyword.");
			}

			setting.addText((text) => {
				text
					.setPlaceholder("TODO:")
					.setValue(rule.keyword)
					.onChange((value) => {
						const target = this.findRule(rule.id);
						if (!target) {
							return;
						}
						target.keyword = value;
						setting.setName(value.trim() || "New rule");
						this.scheduleSave();
					});
			});

			setting.addColorPicker((color) => {
				color
					.setValue(normalizeHexColor(rule.backgroundColor))
					.onChange((value) => {
						const target = this.findRule(rule.id);
						if (!target) {
							return;
						}
						target.backgroundColor = normalizeHexColor(value);
						this.scheduleSave();
					});
			});

			setting.addColorPicker((color) => {
				color
					.setValue(
						normalizeHexColor(rule.textColor, DEFAULT_TEXT_COLOR),
					)
					.onChange((value) => {
						const target = this.findRule(rule.id);
						if (!target) {
							return;
						}
						target.textColor = normalizeHexColor(
							value,
							DEFAULT_TEXT_COLOR,
						);
						this.scheduleSave();
					});
			});

			setting.addExtraButton((button) => {
				button
					.setIcon("arrow-up")
					.setTooltip("Move up")
					.setDisabled(index === 0)
					.onClick(async () => {
						if (!this.swapRules(rule.id, -1)) {
							return;
						}
						await this.plugin.saveSettings();
						this.display();
					});
			});

			setting.addExtraButton((button) => {
				button
					.setIcon("arrow-down")
					.setTooltip("Move down")
					.setDisabled(index === rules.length - 1)
					.onClick(async () => {
						if (!this.swapRules(rule.id, 1)) {
							return;
						}
						await this.plugin.saveSettings();
						this.display();
					});
			});

			setting.addExtraButton((button) => {
				button
					.setIcon("trash")
					.setTooltip("Delete rule")
					.onClick(async () => {
						const i = this.plugin.settings.rules.findIndex(
							(r) => r.id === rule.id,
						);
						if (i === -1) {
							return;
						}
						this.plugin.settings.rules.splice(i, 1);
						await this.plugin.saveSettings();
						this.display();
					});
			});
		});
	}

	private findRule(id: string): HighlightRule | undefined {
		return this.plugin.settings.rules.find((rule) => rule.id === id);
	}

	private swapRules(id: string, offset: number): boolean {
		const rules = this.plugin.settings.rules;
		const index = rules.findIndex((rule) => rule.id === id);
		const target = index + offset;
		if (index === -1 || target < 0 || target >= rules.length) {
			return false;
		}
		const [item] = rules.splice(index, 1);
		rules.splice(target, 0, item);
		return true;
	}
}

function applyHighlightToParagraphs(
	paragraphs: HTMLElement[],
	rules: HighlightRule[],
): void {
	for (const paragraph of paragraphs) {
		if (!(paragraph instanceof HTMLElement)) {
			continue;
		}
		if (paragraph.closest("blockquote, li, pre, code, td, th, details")) {
			continue;
		}
		const text = paragraph.textContent ?? "";
		const rule = findMatchingRule(text, rules);
		const previousRuleClass = findRuleClass(paragraph);

		if (!rule) {
			if (previousRuleClass) {
				paragraph.removeClass(previousRuleClass);
			}
			paragraph.removeClass("todo-paragraph-highlight");
			continue;
		}

		const desiredClass = ruleClassName(rule.id);
		if (previousRuleClass && previousRuleClass !== desiredClass) {
			paragraph.removeClass(previousRuleClass);
		}
		paragraph.addClass("todo-paragraph-highlight");
		paragraph.addClass(desiredClass);
	}
}

function findRuleClass(el: HTMLElement): string | null {
	for (const cls of Array.from(el.classList)) {
		if (cls.startsWith("todo-paragraph-rule-")) {
			return cls;
		}
	}
	return null;
}

function ruleClassName(ruleId: string): string {
	return `todo-paragraph-rule-${ruleId}`;
}

function renderRuleCss(rule: HighlightRule): string {
	const bg = normalizeHexColor(rule.backgroundColor);
	const bgActive = darkenColor(bg, 0.14);
	const fg = normalizeHexColor(rule.textColor, DEFAULT_TEXT_COLOR);
	const selector = `.${ruleClassName(rule.id)}`;
	return `${selector} {\n\t--todo-paragraph-bg: ${bg};\n\t--todo-paragraph-bg-active: ${bgActive};\n\t--todo-paragraph-fg: ${fg};\n}`;
}

function buildEditorDecorations(
	view: EditorView,
	rules: HighlightRule[],
): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	if (rules.length === 0) {
		return builder.finish();
	}

	const doc = view.state.doc;
	const matches = findHighlightParagraphs(doc, rules);
	const visibleFrom = view.visibleRanges[0]?.from ?? 0;
	const visibleTo =
		view.visibleRanges[view.visibleRanges.length - 1]?.to ?? doc.length;

	for (const match of matches) {
		const firstLine = doc.line(match.lineNumbers[0]);
		const lastLine = doc.line(
			match.lineNumbers[match.lineNumbers.length - 1],
		);
		if (lastLine.to < visibleFrom || firstLine.from > visibleTo) {
			continue;
		}

		for (let i = 0; i < match.lineNumbers.length; i += 1) {
			const ln = match.lineNumbers[i];
			const line = doc.line(ln);
			const classes = [
				"todo-paragraph-highlight",
				ruleClassName(match.rule.id),
			];
			if (i === 0) {
				classes.push("todo-paragraph-start");
			}
			if (i === match.lineNumbers.length - 1) {
				classes.push("todo-paragraph-end");
			}

			builder.add(
				line.from,
				line.from,
				Decoration.line({ attributes: { class: classes.join(" ") } }),
			);
		}
	}

	return builder.finish();
}

function findHighlightParagraphs(
	doc: Text,
	rules: HighlightRule[],
): RuleMatch[] {
	const matches: RuleMatch[] = [];
	let lineNumber = 1;
	let inFrontmatter = isFrontmatterStart(doc);
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

		if (isBlankLine(line) || isParagraphBoundary(line)) {
			lineNumber += 1;
			continue;
		}

		const paragraphLines = [lineNumber];
		let cursor = lineNumber + 1;
		while (cursor <= doc.lines) {
			const current = doc.line(cursor).text;
			if (
				isBlankLine(current) ||
				isParagraphBoundary(current) ||
				parseFenceOpen(current.trim())
			) {
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

function coerceSettings(
	loaded: unknown,
): TodoParagraphHighlighterSettings {
	if (
		loaded === null ||
		typeof loaded !== "object" ||
		!Array.isArray((loaded as { rules?: unknown }).rules)
	) {
		return createDefaultSettings();
	}
	const rawRules = (loaded as { rules: unknown[] }).rules;
	const rules = rawRules.flatMap<HighlightRule>((raw) => {
		if (raw === null || typeof raw !== "object") {
			return [];
		}
		const r = raw as Partial<HighlightRule>;
		const keyword = typeof r.keyword === "string" ? r.keyword : "";
		const backgroundColor =
			typeof r.backgroundColor === "string"
				? r.backgroundColor
				: DEFAULT_BACKGROUND;
		const textColor =
			typeof r.textColor === "string" ? r.textColor : DEFAULT_TEXT_COLOR;
		const id =
			typeof r.id === "string" && r.id.length > 0 ? r.id : createRuleId();
		return [{ id, keyword, backgroundColor, textColor }];
	});
	if (rules.length === 0) {
		return createDefaultSettings();
	}
	return { rules };
}

function sanitizeRules(rules: HighlightRule[]): HighlightRule[] {
	return rules
		.map((rule) => ({
			id: rule.id || createRuleId(),
			keyword: (rule.keyword ?? "").trim(),
			backgroundColor: normalizeHexColor(rule.backgroundColor),
			textColor: normalizeHexColor(rule.textColor, DEFAULT_TEXT_COLOR),
		}))
		.filter((rule) => rule.keyword.length > 0);
}

function findDuplicateKeywords(rules: HighlightRule[]): Set<string> {
	const seen = new Set<string>();
	const duplicates = new Set<string>();
	for (const rule of rules) {
		const key = rule.keyword.trim();
		if (key.length === 0) {
			continue;
		}
		if (seen.has(key)) {
			duplicates.add(key);
		} else {
			seen.add(key);
		}
	}
	return duplicates;
}

function findMatchingRule(
	text: string,
	sortedRules: HighlightRule[],
): HighlightRule | null {
	for (const rule of sortedRules) {
		if (rule.keyword.length > 0 && text.startsWith(rule.keyword)) {
			return rule;
		}
	}
	return null;
}

function normalizeHexColor(
	color: string | null | undefined,
	fallback: string = DEFAULT_BACKGROUND,
): string {
	const value = (color ?? "").trim().toLowerCase();
	if (/^#[0-9a-f]{6}$/.test(value)) {
		return value;
	}
	if (/^#[0-9a-f]{3}$/.test(value)) {
		const h = value.slice(1);
		return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
	}
	return fallback;
}

function darkenColor(color: string, amount: number): string {
	const rgb = hexToRgb(normalizeHexColor(color));
	if (!rgb) {
		return DEFAULT_BACKGROUND;
	}
	const darkened = rgb.map((channel) =>
		Math.max(0, Math.round(channel * (1 - amount))),
	);
	return `#${darkened
		.map((channel) => channel.toString(16).padStart(2, "0"))
		.join("")}`;
}

function hexToRgb(hex: string): [number, number, number] | null {
	const match = hex.match(/^#([0-9a-f]{6})$/i);
	if (!match) {
		return null;
	}
	const value = match[1];
	return [
		Number.parseInt(value.slice(0, 2), 16),
		Number.parseInt(value.slice(2, 4), 16),
		Number.parseInt(value.slice(4, 6), 16),
	];
}

function isBlankLine(line: string): boolean {
	return line.trim().length === 0;
}

function isFrontmatterStart(doc: Text): boolean {
	if (doc.lines === 0) {
		return false;
	}
	return doc.line(1).text.trim() === "---";
}

function parseFenceOpen(trimmedLine: string): FenceState | null {
	const match = trimmedLine.match(/^([`~]{3,})/);
	if (!match) {
		return null;
	}
	return { markerChar: match[1][0], markerLength: match[1].length };
}

function isFenceClose(trimmedLine: string, fence: FenceState): boolean {
	const escaped = fence.markerChar === "`" ? "`" : "~";
	const pattern = new RegExp(`^${escaped}{${fence.markerLength},}\\s*$`);
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
	if (/^---\s*$/.test(trimmed)) {
		return true;
	}
	if (/^\*\*\*\s*$/.test(trimmed)) {
		return true;
	}
	if (/^___\s*$/.test(trimmed)) {
		return true;
	}
	return false;
}
