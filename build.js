//@ts-check
import {build, serve} from 'esbuild';
import {join, basename} from 'path';
import {cp, rename, opendir, rm} from 'fs/promises';
import {dirname, resolve as realpath, relative} from 'path';
import {fileURLToPath} from 'url';
import htmlPlugin from '@chialab/esbuild-plugin-html';
import clc from 'cli-color';

const __dirname = dirname(fileURLToPath(import.meta.url));
const __dist = join(__dirname, 'dist');
const isDev = process.env.NODE_ENV == 'development';

const isServe = process.argv.some(arg => arg == '--serve');

/**
 * @type {import('esbuild').Plugin}
 */
const renameEntryHtml = {
	name: 'rename entry html',
	setup(build) {
		build.initialOptions.metafile = true;
		const entryPoints = build.initialOptions.entryPoints;
		const entries = entryPoints instanceof Array ? entryPoints :
			Object.values(entryPoints);

		if (entries) {
			build.onEnd(async result => {
				if (isServe)
					return;
				if (!result.metafile)
					return;
				await Promise.all(Object.entries(result.metafile.outputs)
					.map(([out, {inputs}]) => {
						const entry = entries.find(entry_1 => entry_1 in inputs);
						if (!entry)
							return Promise.resolve();
						const dest = join(__dist, 'index.html');
						const oldStats = result.metafile.outputs[out];
						delete result.metafile.outputs[out];
						result.metafile.outputs[relative(__dirname, dest)] = oldStats;
						return rename(out, dest);
					}));
			});
		}
	}
};

/**
 * @type {import('esbuild').Plugin}
 */
const moveAssetsPlugin = {
	name: 'move assets',
	setup(build) {
		const publicPath = build.initialOptions.publicPath ?? '';
		const destDir = __dist;

		build.onResolve(
			{filter: new RegExp(`^/assets/`), namespace: 'file'},
			async args => {
				const basePath = args.path.slice(1);
				const real = realpath(__dirname, basePath);
				const dest = realpath(destDir, basePath);
				await cp(real, dest, {
					dereference: true,
					preserveTimestamps: true,
					force: true,
				});
				return {
					path: `${publicPath}/${basePath}`,
					namespace: 'assets',
					watchFiles: [real],
					external: true,
				};
			}
		);
	}
}

/**
 * @type {() => import('esbuild').Plugin}
 */
const loggerPlugin = () => {
	return {
		name: 'logger',
		setup(build) {
			let start;
			let type;

			build.onStart(() => {
				type = basename(build.initialOptions.outdir);
				if (type == 'dist')
					type = 'all';
				if (!start) {
					start = new Date();
					console.info(clc.yellow(`Build ${type} started at ${start}`));
				}
			});

			build.onEnd(async result => {
				const duration = Date.now() - start.getTime();
				console.info(clc.yellow(`Build ${type} took: ${duration}ms`));
				Object.entries(result.metafile.outputs).map(([output, {inputs}]) => {
					Object.keys(inputs)
						.filter(x => !x.startsWith('node_modules'))
						.map(input => console.log('  ' + clc.greenBright(`${input} => ${output}`)));
				});
				if (result.warnings.length > 0) {
					console.warn(result.warnings);
				}
				if (result.errors.length > 0) {
					console.error(result.errors);
				}
			});
		},
	};
}

/**
 * @type {() => import('esbuild').Plugin}
 */
const cleanPlugin = () => {
	const cleanDist = async () => {
		let pending = [];
		for await (const dir of await opendir(__dist)) {
			const path = realpath(__dist, dir.name);
			console.log(clc.red(`Removing dirty file ${clc.green(path)}`))
			pending.push(rm(path, {
				force: true,
				recursive: true,
			}));
		}
		await Promise.all(pending);
	};
	return {
		name: 'clear',
		async setup(build) {
			const entryPoints = build.initialOptions.entryPoints;
			const entryPoint = entryPoints instanceof Array ?
				entryPoints :
				Object.keys(entryPoints);
			if (entryPoint[0].endsWith('html')) {
				await cleanDist();
			}
		},
	};
};

/**
 * @type {import('esbuild').BuildOptions}
 */
const buildOptions = {
	entryPoints: ['src/index.html'],
	outdir: __dist,
	assetNames: isServe ? '[name]' : '[name]-[hash]',

	bundle: true,
	platform: "browser",
	sourcemap: isDev,
	target: [
		"es2020",
		"chrome96",
		"firefox95",
	],

	minify: !isDev,
	drop: isDev ? [] : ['debugger', 'console'],
	metafile: true,

	loader: {
		'.txt': 'text',
		'.ttf': 'file',
		'.png': 'file',
	},

	plugins: [
		cleanPlugin(),
		htmlPlugin(),
		moveAssetsPlugin,
		renameEntryHtml,
		loggerPlugin(),
	],
};

if (isServe) {
	serve({
		servedir: __dist,
		port: 8000,
		host: 'localhost',
	}, buildOptions)
} else {
	build(buildOptions);
}
