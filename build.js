//@ts-check
import {build as _build} from 'esbuild';
import {join} from 'path';
import {rename, rm} from 'fs/promises';
import {dirname} from 'path';
import {fileURLToPath} from 'url';
import htmlPlugin from '@chialab/esbuild-plugin-html';

const __dirname = dirname(fileURLToPath(import.meta.url));
const __dist = join(__dirname, 'dist');
const isDev = process.env.ENV == 'dev';

const workerEntryPoints = [
	'vs/language/json/json.worker.js',
	'vs/language/css/css.worker.js',
	'vs/language/html/html.worker.js',
	'vs/language/typescript/ts.worker.js',
	'vs/editor/editor.worker.js'
];

const buildPromises = [
	build({
		entryPoints: workerEntryPoints.map((entry) => `./node_modules/monaco-editor/esm/${entry}`),
		bundle: true,
		format: 'iife',
		outbase: './node_modules/monaco-editor/esm/',
		outdir: __dist
	}),
	build({
		entryPoints: ['src/index.html'],
		minify: !isDev,
		bundle: true,
		sourcemap: isDev,
		platform: "browser",
		plugins: [
			htmlPlugin({

			}),
		],
		outdir: __dist,
		loader: {
			'.ttf': 'file',
			'.md': 'text',
		}
	}).then(res => {
		// remove hash for index.html file
		const oldName = Object.entries(res.metafile.outputs)
			.filter(([_, {inputs}]) => 'src/index.html' in inputs)
			.map(([key, _]) => key)
		[0];
		const newName = join(__dist, 'index.html');
		rename(oldName, newName);
	}),
];

/**
 * @param {import ('esbuild').BuildOptions} opts
 */
async function build(opts) {
	const result = await _build(opts);
	opts.entryPoints.map(entrypoint => {
		console.log(`Built ${entrypoint}`);
	});
	if (result.errors.length > 0) {
		console.error(result.errors);
	}
	if (result.warnings.length > 0) {
		console.error(result.warnings);
	}
	return result;
}

await Promise.all(buildPromises);
