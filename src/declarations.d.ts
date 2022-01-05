declare module "*.txt" {
	const url: string;
	export default url;
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
