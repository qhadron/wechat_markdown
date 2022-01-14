import { LitElement, html, css } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

const tag = "w-filepicker";

@customElement(tag)
export default class WFilepicker extends LitElement {
	static override styles = css`
		#chooser {
			height: 100%;
		}

		#input {
			display: none;
		}
	`;

	@property({ attribute: false })
	file: File | null = null;

	@property({ reflect: true })
	accept: string | undefined;

	@query("#input")
	input!: HTMLInputElement;

	override render() {
		const fileDisplay = this.file ? `Picked: ${this.file.name}` : "";
		return html`
			<span>${fileDisplay}</span>
			<button id="chooser" @click=${this.choose}>
				<slot>Load</slot>
			</button>
			<input
				type="file"
				id="input"
				@change=${this.picked}
				accept=${ifDefined(this.accept)}
			/>
		`;
	}

	choose() {
		this.input.click();
	}

	picked(e: Event) {
		const $input = e.target as HTMLInputElement;
		const file = $input?.files?.[0] ?? null;
		console.log("I'm back!", $input?.files, file);
		if (!file) return;
		this.file = file;
		this.dispatchEvent(new Event(e.type, e));
	}
}

declare global {
	interface HTMLElementTagNameMap {
		[tag]: WFilepicker;
	}
}
