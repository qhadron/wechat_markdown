import MarkdownIt from 'markdown-it';

///////////////
//  plugins  //
///////////////
import abbr from 'markdown-it-abbr';
import container from 'markdown-it-container';
import deflist from 'markdown-it-deflist';
import emoji from 'markdown-it-emoji';
import footnote from 'markdown-it-footnote';
import ins from 'markdown-it-ins';
import mark from 'markdown-it-mark';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import inject_linenumbers from 'markdown-it-inject-linenumbers';

const plugins = [
	abbr, container, deflist, emoji, footnote, ins, mark, sub, sup,
];

export const makeMd = (additionalPlugins=[]) => {
	const md = new MarkdownIt().set({
		html: true,
		linkify: true,
		typographer: true,
	});
	[...plugins, ...additionalPlugins]
		.forEach(plugin => md.use(plugin));
	return md;
};

export enum OutputType {
	preview = 'preview',
	source = 'source',
}

export const md = {
	[OutputType.preview]: makeMd([inject_linenumbers]),
	[OutputType.source]: makeMd(),
}
