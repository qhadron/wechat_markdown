import * as monaco from 'monaco-editor/esm/vs/editor/editor.main.js';

declare global {
	interface Window {
		MonacoEnvironment: any;
	}
}

self.MonacoEnvironment = {
	getWorkerUrl: function (moduleId, label) {
		if (label === 'json') {
			return './vs/language/json/json.worker.js';
		}
		if (label === 'css' || label === 'scss' || label === 'less') {
			return './vs/language/css/css.worker.js';
		}
		if (label === 'html' || label === 'handlebars' || label === 'razor') {
			return './vs/language/html/html.worker.js';
		}
		if (label === 'typescript' || label === 'javascript') {
			return './vs/language/typescript/ts.worker.js';
		}
		return './vs/editor/editor.worker.js';
	}
};

/**
 * 
 */
export const create = (container: HTMLElement) => {
	const editor = monaco.editor.create(container, {
		scrollBeyondLastLine: true,
		language: 'markdown',
		minimap: {
			enabled: false,
		},
		automaticLayout: true,
	});


	return editor;
};