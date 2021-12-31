import {marked} from 'marked';
import * as monaco from 'monaco-editor';
import * as Editor from './editor';
import juice from 'juice';

import exampleMarkdown from './example.md';

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
$style.getModel().setValue(
`
h1 {
	color: red;
}
p {
	color: blue;
}
`
);

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

// /**
//  * @param $root {HTMLElement} root element
//  * @param style {string} style
//  */
// function getStyledHtml($root, style) {
// 	
// }
