import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import fileSaver from "file-saver";

const tag = "w-filesaver";

export interface FileSaveEventData {
	save: typeof fileSaver;
	target?: string;
}

export class FileSaveEvent extends CustomEvent<FileSaveEventData> {}
export const EventName = "saveFile" as const;

@customElement(tag)
export default class WFilesaver extends LitElement {
	static override styles = css`
		button {
			height: 100%;
		}
	`;

	@property()
	for: string | undefined;

	override render() {
		return html`
			<button @click=${this.#onClick}>
				<slot>Save</slot>
			</button>
		`;
	}

	#onClick() {
		this.dispatchEvent(
			new FileSaveEvent(EventName, {
				bubbles: true,
				detail: {
					save: fileSaver,
					target: this.for,
				},
			})
		);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		[tag]: WFilesaver;
	}
	interface ElementEventMap {
		[EventName]: FileSaveEvent;
	}
}
