import interact from 'interactjs';
import debounce from 'debounce';
import Split from 'split.js';

import exampleMarkdown from './examples/example.md.txt';
import exampleCss from './examples/example.css.txt';

import {Editor} from './editor';
import * as utils from './utils';

const $editor = Editor.create(document.querySelector('#editor'));
const $editorContainer: HTMLElement = document.querySelector('#editor-container');
const $style = Editor.create(document.querySelector('#style'));
const $styleContainer: HTMLElement = document.querySelector('#style-container');
const $preview: HTMLIFrameElement = document.querySelector('#preview');
const $source: HTMLElement = document.querySelector('#source');
const $viewSelect: HTMLSelectElement = document.getElementById('view') as any;


const mainSplit = Split(['#editing', '#output'], {
	sizes: [50, 50],
});
const editingSplit = Split(['#editor-container', '#style-container'], {
	sizes: [50, 50],
	direction: 'vertical',
});

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

		[...document.querySelectorAll('#output-container .content')].forEach(
			($el: HTMLElement) => {
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

		[$editor, $style].forEach(editor => {
			const observer = new ResizeObserver(
				debounce(() => editor.layout() ,State.RENDER_LIMIT_MS)
			);
			observer.observe(editor.getContainerDomNode());
			return observer;
		});

		console.log("Initialized state!");

		this.render();
	}

	static RENDER_LIMIT_MS = 100;

	maybeRender = debounce(() => this.#renderOutput(), State.RENDER_LIMIT_MS);
	render() {
		this.maybeRender.clear();
		this.maybeRender();
		this.maybeRender.flush();
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
			// make external links open in new window
			$preview.contentDocument.querySelectorAll('a').forEach(link => {
				if (link.host != location.host)
					link.target = '_blank';
			});
			break;

			case 'source':
				$source.textContent = utils.generateSource(html, style);
			utils.colorizeElement($source, {});
			break;
		}
	}
};

declare global {
	interface Window {state: State}
}
window.state = new State();
