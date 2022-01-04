import { md, OutputType } from "./markdown-it";
import juice from "juice";
import DOMPurify from "dompurify";
import * as monaco from "monaco-editor";

export function selectAll(element: HTMLElement): void {
	const range = new Range();
	range.setStart(element, 0);
	range.setEnd(element, element.childElementCount);
	const selection = document.getSelection();
	if (selection == null) return;
	selection.removeAllRanges();
	selection.addRange(range);
}

export function generateHtml(markdownText: string, type: OutputType): string {
	return md[type].render(markdownText);
}

export function generateSource(html: string, style: string): string {
	return DOMPurify.sanitize(juice(style + html));
}

export function lerp(begin: number, end: number, ratio: number): number {
	return begin + ratio * (end - begin);
}

export function frac(begin: number, end: number, val: number): number {
	return (val - begin) / (end - begin);
}

function findLine($root: HTMLElement, linenr: number): HTMLElement | null {
	return $root.querySelector(`.source-line[data-source-line="${linenr}"]`);
}

function findPrevPos($root: HTMLElement, linenr: number): [number, number] {
	let cur = linenr - 1;

	let $prev = null;
	do {
		$prev = findLine($root, cur);
		cur -= 1;
	} while ($prev == null && cur > 0);

	return [Math.max(cur, 0), $prev != null ? $prev.offsetTop : 0];
}

function findNextPos(
	$root: HTMLElement,
	linenr: number,
	max: number
): [number, number] {
	let cur = linenr + 1;
	const limit = max + 1;

	let $next = null;
	do {
		$next = findLine($root, cur);
		cur += 1;
	} while ($next == null && cur < limit);

	return [
		Math.min(cur, limit),
		$next != null ? $next.offsetTop : $root.scrollHeight,
	];
}

export function scroll($element: HTMLElement | Window, pos: number): void {
	$element.scroll({
		top: pos,
		behavior: "smooth",
	});
}

export function scrollToLine(
	$preview: HTMLIFrameElement,
	line: number | string,
	numberOfLines: number | string
): void {
	/**
	 * The position on the page the current line should be. 0 is the top and 1 is the bottom.
	 */
	const ratio = 0.4;
	const linenr = Number(line);
	const maxLine = Number(numberOfLines);
	// scrolling must be done on the iframe window
	const $window = $preview.contentWindow;
	const $document = $preview.contentDocument?.documentElement;
	if ($window == null || $document == null)
		throw new Error("iframe is not interactable");

	if (linenr === 0) {
		return scroll($window, 0);
	}

	if (linenr === maxLine) {
		return scroll($window, $document.scrollHeight);
	}

	const $target = findLine($document, linenr);

	let offset = 0;

	if ($target != null) {
		offset = $target.offsetTop;
	} else {
		const [prevLine, prevOff] = findPrevPos($document, linenr);
		const [nextLine, nextOff] = findNextPos($document, linenr, maxLine);

		offset = lerp(prevOff, nextOff, frac(prevLine, nextLine, linenr));
	}

	return scroll($window, offset - $preview.clientHeight * ratio);
}

export const colorizeElement = monaco.editor.colorizeElement;
