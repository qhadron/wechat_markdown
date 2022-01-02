import Split from 'split.js';

const defaultOptions = {
	sizes: [50, 50],
	minSize: 0,
	onDragEnd(sizes: number[]) {
		window.state.layout(sizes);
	},
}

export const mainSplit = Split(['#editing', '#output'], {
	...defaultOptions,
	direction: "horizontal"
});
export const editingSplit = Split(['#editor-container', '#style-container'], {
	...defaultOptions,
	direction: "vertical"
});

declare global {
	interface Window {
		mainSplit: typeof mainSplit,
		editingSplit: typeof editingSplit,
	}
}

Object.assign(window, {mainSplit, editingSplit});
