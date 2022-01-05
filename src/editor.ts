import * as monaco from "monaco-editor";

declare global {
	interface Window {
		MonacoEnvironment: monaco.Environment;
	}
}

self.MonacoEnvironment = {
	// @ts-expect-error this is external code
	getWorkerUrl: function (moduleId, label) {
		if (label === "css" || label === "scss" || label === "less") {
			return "./vs/language/css/css.worker.js";
		}
		return "./vs/editor/editor.worker.js";
	},
};

export const Editor = {
	create($container: HTMLElement): monaco.editor.IStandaloneCodeEditor {
		const editor = monaco.editor.create($container, {
			scrollBeyondLastLine: true,
			language: $container.dataset.language,
			minimap: {
				enabled: false,
			},
			smoothScrolling: true,
			cursorSmoothCaretAnimation: true,
		});

		return editor;
	},
	scrollType: monaco.editor.ScrollType,
};
