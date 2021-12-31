//@ts-check
import {build as _build} from 'esbuild';
import {join} from 'path';
import {rename, rm} from 'fs/promises';
import {dirname} from 'path';
import {fileURLToPath} from 'url';
import htmlPlugin from '@chialab/esbuild-plugin-html';
import clc from 'cli-color';

const __dirname = dirname(fileURLToPath(import.meta.url));
const __dist = join(__dirname, 'dist');
const isDev = process.env.ENV == 'dev';
const isWatch = process.argv.filter(arg => arg == '--watch').length > 0;

const workerEntryPoints = [
	'vs/language/json/json.worker.js',
	'vs/language/css/css.worker.js',
	'vs/language/html/html.worker.js',
	'vs/language/typescript/ts.worker.js',
	'vs/editor/editor.worker.js'
];

/**
 * by default, the index.html from the build is appeneded with a hash.
 * this is inconvenient and unnecessary.
 *
 * @param {import('esbuild').BuildResult} res
 */
async function renameIndexHtml(res) {
	// remove hash for index.html file
	const oldName = Object.entries(res.metafile.outputs)
		.filter(([_, {inputs}]) => 'src/index.html' in inputs)
		.map(([key, _]) => key)
	[0];
	if (!oldName) return res;
	const newName = join(__dist, 'index.html');
	await rename(oldName, newName);
	return res;
}

/**
 * @param {import('esbuild').BuildResult} result
 */
function logBuildResult(result) {
	console.log(clc.yellow.bold(`Build at ${new Date()}`));
	Object.entries(result.metafile.outputs).map(([output, {inputs}]) => {
		Object.keys(inputs)
			.filter(x => !x.startsWith('node_modules'))
			.map(input => console.log(clc.greenBright(`${input} => ${output}`)));
	});
	if (result.warnings.length > 0) {
		console.warn(result.warnings);
	}
	if (result.errors.length > 0) {
		console.error(result.errors);
	}
	return result;
}

const buildPromises = [
	build({
		entryPoints: workerEntryPoints.map((entry) => `./node_modules/monaco-editor/esm/${entry}`),
		bundle: true,
		format: 'iife',
		outbase: './node_modules/monaco-editor/esm/',
		outdir: __dist,
		metafile: true,
	}),
	build({
		entryPoints: ['src/index.html'],
		minify: !isDev,
		bundle: true,
		sourcemap: isDev,
		platform: "browser",
		watch: isWatch && {
			onRebuild(err, res) {
				logBuildResult(res);
				return renameIndexHtml(res);
			}
		},
		plugins: [
			htmlPlugin({

			}),
		],
		outdir: __dist,
		loader: {
			'.ttf': 'file',
			'.md': 'text',
		},
		metafile: true,
	}).then(logBuildResult).then(renameIndexHtml),
];

/**
 * @param {import ('esbuild').BuildOptions} opts
 */
async function build(opts) {
	const result = await _build(opts);
	return result;
}

await Promise.all(buildPromises);
