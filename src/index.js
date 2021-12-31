import {marked} from 'marked';
import * as monaco from 'monaco-editor';
import * as Editor from './editor';
import juice from 'juice';

import exampleMarkdown from './examples/example.md.txt';
import exampleCss from './examples/example.css.txt';

const $editor = Editor.create(document.querySelector('#editor'));
const $style = Editor.create(document.querySelector('#style'));
/**
 * @type HTMLIFrameElement
 */
const $preview = document.querySelector('#preview');
const $source = document.querySelector('#source');

$editor.onDidChangeModelContent(onSourceChanged);
$editor.getModel().setValue(exampleMarkdown);

$style.onDidChangeModelContent(onSourceChanged);
$style.getModel().setValue(exampleCss);

/**
 * @param {HTMLElement} element
 */
function selectAll(element) {
	const range = new Range();
	range.setStart(element, 0);
	range.setEnd(element, element.childElementCount);
	document.getSelection().removeAllRanges();
	document.getSelection().addRange(range);
}

$source.addEventListener('dblclick', () => {
	selectAll($source);
});

function onSourceChanged() {
	const source = $editor.getModel().getValue();
	const html = marked.parse(source);
	const css = $style.getModel().getValue();

	const style = `<style>${css}</style>`;
	$preview.contentDocument.open();
	$preview.contentDocument.write(style);
	$preview.contentDocument.write(html);
	$preview.contentDocument.close();

	// $source.textContent = $preview.contentDocument.body.innerHTML;
	$source.textContent = juice(style + $preview.contentDocument.body.innerHTML);
	monaco.editor.colorizeElement($source);
}
