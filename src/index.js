import {md} from './markdown-it.ts';
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
	const markdownText = $editor.getModel().getValue();
	const html = generateHtml(markdownText);
	const cssText = $style.getModel().getValue();

	const style = `<style>${cssText}</style>`;
	$preview.contentDocument.open();
	$preview.contentDocument.write(style);
	$preview.contentDocument.write(html);
	$preview.contentDocument.close();

	const $body = $preview.contentDocument.body;
	$source.textContent = generateSource($body, style);
	monaco.editor.colorizeElement($source);
}

/**
 * @param {string} markdownText
 * @returns {string} html source
 */
function generateHtml(markdownText) {
	return md.render(markdownText);
}

/**
 * @param {HTMLBodyElement} $body
 * @param {string} style
 * @returns {string} html source
 */
function generateSource($body, style) {
	return juice(style + $body.innerHTML);
}
