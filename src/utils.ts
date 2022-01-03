import {md, OutputType} from './markdown-it';
import juice from 'juice';
import DOMPurify from 'dompurify';
import * as monaco from 'monaco-editor';

export function selectAll(element: HTMLElement) {
	const range = new Range();
	range.setStart(element, 0);
	range.setEnd(element, element.childElementCount);
	document.getSelection().removeAllRanges();
	document.getSelection().addRange(range);
}

export function generateHtml(markdownText: string, type: OutputType): string {
	return md[type].render(markdownText);
}

export function generateSource(html: string, style: string): string {
	return DOMPurify.sanitize(juice(style + html));
}

export function lerp(begin: number, end: number, ratio:number) {
	return begin + ratio * (end - begin);
}

export function frac(begin: number, end: number, val: number) {
	return (val - begin) / (end - begin);
}

function findLine($root: HTMLElement, linenr: number): HTMLElement {
	return $root.querySelector(`.source-line[data-source-line="${linenr}"]`);
}

function findPrevPos($root: HTMLElement, linenr: number) {
	let cur = linenr - 1;

	let $prev = null;
	do {
		$prev = findLine($root, cur);
		cur -= 1;
	} while (!$prev && cur > 0);

	return [Math.max(cur, 0), $prev ? $prev.offsetTop : 0];
}

function findNextPos($root: HTMLElement, linenr: number, max: number) {
	let cur = linenr + 1;
	let limit = max + 1;

	let $next = null;
	do {
		$next = findLine($root, cur);
		cur += 1;
	} while (!$next && cur < limit);

	return [Math.min(cur, limit), $next ? $next.offsetTop : $root.scrollHeight];
}

export function scroll($element: HTMLElement | Window, pos: number) {
	const options = {
		top: pos,
		behavior: 'smooth',
	};
	$element.scroll(options as any);
}

export function scrollToLine($preview: HTMLIFrameElement, line: number | string, numberOfLines: number | string) {
	/**
	 * The position on the page the current line should be. 0 is the top and 1 is the bottom.
	 */
	const ratio = .4;
	const linenr = Number(line);
	const maxLine = Number(numberOfLines);
	// scrolling must be done on the iframe window
	const $window = $preview.contentWindow;
	const $document = $preview.contentDocument.documentElement;

	if (linenr === 0) {
		return scroll($window, 0);
	}

	if (linenr ===  maxLine) {
		return scroll($window, $document.scrollHeight);
	}

	const $target = findLine($document, linenr);

	let offset = 0;

	if ($target) {
		offset = $target.offsetTop;
	} else {
		const [prevLine, prevOff] = findPrevPos($document, linenr);
		const [nextLine, nextOff] = findNextPos($document, linenr, maxLine);

		offset = lerp(prevOff, nextOff, frac(prevLine, nextLine, linenr));
	}

	return scroll($window, offset - $preview.clientHeight * ratio);
}

export const colorizeElement = monaco.editor.colorizeElement;
