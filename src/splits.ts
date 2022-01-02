import Split from 'split.js';

export const mainSplit = Split(['#editing', '#output'], {
	sizes: [50, 50],
});
export const editingSplit = Split(['#editor-container', '#style-container'], {
	sizes: [50, 50],
	direction: 'vertical',
});
