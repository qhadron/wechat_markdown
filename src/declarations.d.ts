declare module "*.txt" {
	export default string;
}

declare module "markdown-it-*" {
	import {
		PluginSimple,
		PluginWithOptions,
		PluginWithParams,
	} from "markdown-it";
	const plugin: PluginSimple | PluginWithOptions | PluginWithParams;
	export default plugin;
}
