import debounce from "debounce";

import { Editor } from "./editor";
import * as utils from "./utils";
import { OutputType } from "./markdown-it";

import exampleMarkdown from "./examples/example.md.txt";
import exampleCss from "./examples/example.css.txt";
import WFilepicker from "./components/w-filepicker";

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
		if (src === this.#markdownSource) return;
		this.#markdownSource = src;
		$editor.setValue(src);
		this.maybeRender();
	}

	get cssSource(): string {
		return this.#cssSource;
	}

	set cssSource(src) {
		if (this.#cssSource === src) return;
		this.#cssSource = src;
		$style.setValue(src);
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

		const $editorPicker = document.querySelector(
			"#editor-container w-filepicker"
		) as WFilepicker;
		$editor.onDidChangeModelContent(() => {
			const model = $editor.getModel();
			if (model == null) return;
			this.#markdownSource = model.getValue();
			this.#maxEditorLines = model.getLineCount();
			this.maybeRender();
			$editorPicker.file = null;
		});
		$editor.onDidChangeCursorPosition(() => {
			const model = $editor.getModel();
			if (model == null) return;
			const position = $editor.getPosition();
			if (position != null) this.editorLine = position.lineNumber;
		});
		$editorPicker.addEventListener("change", (_) => {
			if (!$editorPicker.file) return;
			const contents = utils.readFileText($editorPicker.file);
			if (!contents) return;
			void contents.then((contents) => {
				this.markdownSource = contents;
			});
		});

		const $stylePicker = document.querySelector(
			"#style-container w-filepicker"
		) as WFilepicker;
		$style.onDidChangeModelContent(() => {
			const model = $style.getModel();
			if (model == null) return;
			this.#cssSource = model.getValue();
			this.maybeRender();
			$stylePicker.file = null;
		});
		$stylePicker.addEventListener("change", (_) => {
			if (!$stylePicker.file) return;
			const contents = utils.readFileText($stylePicker.file);
			if (!contents) return;
			void contents.then((contents) => {
				this.cssSource = contents;
			});
		});

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

		document.querySelector("#editing")?.addEventListener("saveFile", (e) => {
			const { save, target } = e.detail;

			const { text, filename } = (() => {
				switch (target) {
					case "editor":
						return { text: this.markdownSource, filename: "wechat.md" };
					case "style":
						return { text: this.cssSource, filename: "wechat.css" };
				}
				throw new Error(
					`Wrong attribute for=${target ?? "???"} on file save event`
				);
			})();

			if (!text) return;

			const blob = new Blob([text], {
				type: "text/plain;charset=utf-8",
			});
			save(blob, filename);
		});

		document
			.querySelector("#output w-filesaver")
			?.addEventListener("saveFile", (e) => {
				const { save } = e.detail;
				const blob = new Blob([this.generateSource(OutputType.source)], {
					type: "text/plain;charset=utf-8",
				});
				save(blob, "wechat.html");
			});

		this.loadExamples();

		console.log("Initialized state!");

		this.render();
	}

	loadExamples(): void {
		void fetch(exampleMarkdown)
			.then(async (r) => await r.text())
			.then((source) => {
				if (!this.markdownSource) this.markdownSource = source;
			});
		void fetch(exampleCss)
			.then(async (r) => await r.text())
			.then((source) => {
				if (!this.cssSource) this.cssSource = source;
			});
	}

	static RENDER_LIMIT_MS = 100;

	maybeRender = debounce(() => this.#renderOutput(), State.RENDER_LIMIT_MS);
	render(): void {
		this.maybeRender.clear();
		this.maybeRender();
		this.maybeRender.flush();
	}

	generateSource(type: OutputType = this.#view): string {
		const markdownText = this.markdownSource;
		const html = utils.generateHtml(markdownText, type);
		const cssText = this.cssSource;
		const style = `<style>${cssText}</style>`;
		return utils.generateSource(html, style);
	}

	#renderOutput(): void {
		const source = this.generateSource();
		switch (this.view) {
			case "preview": {
				if ($preview.contentDocument == null) return;
				$preview.contentDocument.open();
				$preview.contentDocument.write(source);
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
				void Editor.colorize(source, "html", {}).then(
					(colored) => ($source.innerHTML = colored)
				);
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
