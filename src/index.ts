import exampleMarkdown from './examples/example.md.txt';
import exampleCss from './examples/example.css.txt';

import * as Editor from './editor';
import * as utils from './utils';

const $editor = Editor.create(document.querySelector('#editor'));
const $style = Editor.create(document.querySelector('#style'));
const $preview: HTMLIFrameElement = document.querySelector('#preview');
const $source: HTMLElement = document.querySelector('#source');
const $viewSelect: HTMLSelectElement = document.getElementById('view') as any;

enum OutputType {
	preview = 'preview',
	source = 'source',
}

class State {
	#view: OutputType;

	get view() {
		return this.#view ?? OutputType.preview;
	}

	set view(newView: OutputType) {
		if (this.#view == newView)
			return;

		this.#view = newView;

		this.render();

		Array.from(document.querySelectorAll('#output-container .content'))
			.forEach(($el: HTMLElement) => {
				if ($el.id.startsWith(this.#view)) {
					$el.style.display = '';
				} else {
					$el.style.display = 'none';
				}
			});
	}

	#markdownSource = '';
	#cssSource = '';

	get markdownSource() {
		return this.#markdownSource;
	}
	get cssSource() {
		return this.#cssSource;
	}
	set markdownSource(src) {
		this.#markdownSource = src;
		this.maybeRender();
	}
	set cssSource(src) {
		this.#cssSource = src;
		this.maybeRender();
	}

	#editorLine = 0;
	#maxEditorLines = 0;

	get editorLine() {
		return this.#editorLine;
	}
	set editorLine(val: number) {
		if (val == this.#editorLine)
			return;
		this.#editorLine = val;
		utils.scrollToLine($preview, this.#editorLine, this.#maxEditorLines);
	}

	constructor() {
		console.log("Initializing state...");

		$editor.onDidChangeModelContent(() => {
			this.markdownSource = $editor.getModel().getValue()
			this.#maxEditorLines = $editor.getModel().getLineCount();
		});
		$editor.onDidChangeCursorPosition(() => {
			this.editorLine = $editor.getPosition().lineNumber;
		});
		$editor.getModel().setValue(exampleMarkdown);

		$style.onDidChangeModelContent(() => this.cssSource = $style.getModel().getValue());
		$style.getModel().setValue(exampleCss);

		$viewSelect.addEventListener('change', () => {
			this.view = $viewSelect.value as OutputType;
		});

		$source.addEventListener('dblclick', () => {
			utils.selectAll($source);
		});

		this.view = OutputType.preview;
		console.log("Initialized state!");

		this.render();
	}

	static RENDER_LIMIT_MS = 100;
	/**
	 * @type {Date | null}
	 */
	#renderJobId: number | null = null;

	maybeRender() {
		if (this.#renderJobId) {
			clearTimeout(this.#renderJobId);
		}
		this.#renderJobId = setTimeout(() => this.#renderOutput(), State.RENDER_LIMIT_MS);
	}

	render() {
		if (this.#renderJobId) {
			clearTimeout(this.#renderJobId);
		}
		this.#renderJobId = setTimeout(() => this.#renderOutput(), 0);
	}

	#renderOutput() {
		// const markdownText = $editor.getModel().getValue();
		const markdownText = this.markdownSource;
		const html = utils.generateHtml(markdownText);
		const cssText = this.cssSource;

		const style = `<style>${cssText}</style>`;

		switch (this.view) {
			case 'preview':
				$preview.contentDocument.open();
				$preview.contentDocument.write(style);
				$preview.contentDocument.write(html);
				$preview.contentDocument.close();
				break;

			case 'source':
				const $body: HTMLBodyElement = $preview.contentDocument.body as any;
				$source.textContent = utils.generateSource($body, style);
				utils.colorizeElement($source, {});
				break;
		}
	}
};

declare global {
	interface Window {state: State}
}
window.state = new State();
