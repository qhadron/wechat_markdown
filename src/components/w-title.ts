import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";

const tag = "w-title";

@customElement(tag)
export default class WTitle extends LitElement {
	static override styles = css`
		:host {
			display: inline;
		}
	`;

	override render() {
		return html`<h1 part="name"><slot></slot></h1> `;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		[tag]: WTitle;
	}
}
