import {md} from './markdown-it';
import juice from 'juice';
import * as monaco from 'monaco-editor';

export function selectAll(element: HTMLElement) {
	const range = new Range();
	range.setStart(element, 0);
	range.setEnd(element, element.childElementCount);
	document.getSelection().removeAllRanges();
	document.getSelection().addRange(range);
}

export function generateHtml(markdownText: string): string {
	return md.render(markdownText);
}

export function generateSource($body: HTMLBodyElement, style: string): string {
	return juice(style + $body.innerHTML);
}

export const colorizeElement = monaco.editor.colorizeElement;
