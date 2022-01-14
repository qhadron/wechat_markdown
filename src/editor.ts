import * as monaco from "monaco-editor";

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
	colorizeElement: monaco.editor.colorizeElement,
};
