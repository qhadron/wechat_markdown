import debounce from "debounce";

import exampleMarkdown from "./examples/example.md.txt";
import exampleCss from "./examples/example.css.txt";

import { Editor } from "./editor";
import * as utils from "./utils";
import { OutputType } from "./markdown-it";

/* eslint-disable @typescript-eslint/no-non-null-assertion --
 * specified in index.html
 */
const $editor = Editor.create(document.querySelector("#editor")!);
const $style = Editor.create(document.querySelector("#style")!);
const $preview: HTMLIFrameElement = document.querySelector("#preview")!;
const $source: HTMLElement = document.querySelector("#source")!;
const $viewSelect: HTMLSelectElement = document.getElementById(
	"view"
)! as HTMLSelectElement;
/* eslint-enable @typescript-eslint/no-non-null-assertion */

class State {
	#view: OutputType = OutputType.preview;

	get view(): OutputType {
		return this.#view;
	}

	set view(newView: OutputType) {
		if (this.#view === newView) return;

		this.#view = newView;

		this.render();

		[...document.querySelectorAll("#output-container .content")].forEach(
			($el) => {
				if (!($el instanceof HTMLElement)) return;
				if ($el.id.startsWith(this.#view)) {
					$el.style.display = "";
				} else {
					$el.style.display = "none";
				}
			}
		);
	}

	#markdownSource = "";
	#cssSource = "";
	get markdownSource(): string {
		return this.#markdownSource;
	}

	set markdownSource(src) {
		this.#markdownSource = src;
		this.maybeRender();
	}

	get cssSource(): string {
		return this.#cssSource;
	}

	set cssSource(src) {
		this.#cssSource = src;
		this.maybeRender();
	}

	#editorLine = 0;
	#maxEditorLines = 0;

	get editorLine(): number {
		return this.#editorLine;
	}

	set editorLine(val: number) {
		if (val === this.#editorLine) return;
		this.#editorLine = val;
		utils.scrollToLine($preview, this.#editorLine, this.#maxEditorLines);
	}

	constructor() {
		console.log("Initializing state...");

		$editor.onDidChangeModelContent(() => {
			const model = $editor.getModel();
			if (model == null) return;
			this.markdownSource = model.getValue();
			this.#maxEditorLines = model.getLineCount();
		});
		$editor.onDidChangeCursorPosition(() => {
			const model = $editor.getModel();
			if (model == null) return;
			const position = $editor.getPosition();
			if (position != null) this.editorLine = position.lineNumber;
		});
		$editor.getModel()?.setValue(exampleMarkdown);

		$style.onDidChangeModelContent(() => {
			const model = $style.getModel();
			if (model == null) return;
			this.cssSource = model.getValue();
		});
		$style.getModel()?.setValue(exampleCss);

		$viewSelect.addEventListener("change", () => {
			this.view = $viewSelect.value as OutputType;
		});

		$source.addEventListener("dblclick", () => {
			utils.selectAll($source);
		});

		this.view = OutputType.preview;

		document.querySelectorAll("#editing .name").forEach(($el, i) => {
			$el.addEventListener("click", () => {
				const split = window.editingSplit;
				const [upper, lower] = split.getSizes();
				const smallerI = upper > lower ? 0 : i;
				const otherI = 1 - i;

				if (upper === lower) {
					split.collapse(otherI);
				} else if (i === smallerI) {
					split.setSizes([50, 50]);
				} else {
					split.collapse(otherI);
				}

				this.#layout();
			});
		});

		console.log("Initialized state!");

		this.render();
	}

	static RENDER_LIMIT_MS = 100;

	maybeRender = debounce(() => this.#renderOutput(), State.RENDER_LIMIT_MS);
	render(): void {
		this.maybeRender.clear();
		this.maybeRender();
		this.maybeRender.flush();
	}

	#renderOutput(): void {
		const markdownText = this.markdownSource;
		const html = utils.generateHtml(markdownText, this.#view);
		const cssText = this.cssSource;

		const style = `<style>${cssText}</style>`;

		switch (this.view) {
			case "preview": {
				if ($preview.contentDocument == null) return;
				$preview.contentDocument.open();
				$preview.contentDocument.write(style);
				$preview.contentDocument.write(html);
				$preview.contentDocument.close();
				// make external links open in new window
				$preview.contentDocument.querySelectorAll("a").forEach(($link) => {
					if ($link.host !== location.host) $link.target = "_blank";
				});

				$preview.contentDocument.body.addEventListener("click", (event) => {
					let target: HTMLElement | null = event.target as HTMLElement;
					let line: string | undefined;
					while (target != null) {
						line = target?.dataset?.sourceLine;
						if (line !== undefined) break;
						target = target?.parentElement;
					}
					if (line === undefined) return;
					$editor.revealLineInCenter(Number(line), Editor.scrollType.Smooth);
				});
				break;
			}
			case "source": {
				$source.textContent = utils.generateSource(html, style);
				void utils.colorizeElement($source, {});
				break;
			}
		}
	}

	#layout = debounce(
		() => {
			$editor.layout();
			$style.layout();
		},
		State.RENDER_LIMIT_MS,
		true
	);

	layout(_sizes: number[]): void {
		// TODO: save sizes
		this.#layout();
	}
}

declare global {
	interface Window {
		state: State;
	}
}
window.state = new State();
