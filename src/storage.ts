import * as idb from "idb-keyval";
import debounce from "debounce";

/** version of data storage in case of upgrading */
export const VERSION = "1";

const enum Keys {
	markdown = "md",
	css = "css",
}

const write = () => debounce(idb.set);
const read = () => idb.get;

export class StoredVal<T> {
	key: Keys;
	#write = write();
	#read = read();

	constructor(key: Keys) {
		this.key = key;
	}

	async setValue(val: T): Promise<void> {
		return await this.#write(this.key, val);
	}

	async getValue(): Promise<T | undefined> {
		return await this.#read(this.key);
	}
}

export const Storage = {
	markdownSource: new StoredVal<string>(Keys.markdown),
	cssSource: new StoredVal<string>(Keys.css),
};
