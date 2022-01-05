import htmlPlugin from "@chialab/esbuild-plugin-html";
import clc from "cli-color";
import {
	build,
	serve,
	Plugin,
	BuildOptions,
	Metafile,
	BuildResult,
	ImportKind,
} from "esbuild";
import { cp, opendir, rename, rm, mkdir, readFile, stat } from "fs/promises";
import {
	basename,
	dirname,
	join,
	relative,
	resolve as realpath,
	parse as parsePath,
	normalize as normalizPath,
} from "path";
import { fileURLToPath } from "url";
import xxhash from "xxhashjs";

const DIR_NAME = dirname(fileURLToPath(import.meta.url));
const DIST = join(DIR_NAME, "dist");
const isDev = process.env.NODE_ENV === "development";

const isServe = process.argv.some((arg) => arg === "--serve");

const publicPath = isDev ? "" : process.env.PUBLIC_PATH;

/**
 * returns path of entrypoints, normalized from build options
 */
function normalizeEntryPoints(
	entryPoints: BuildOptions["entryPoints"]
): string[] {
	const entries =
		entryPoints instanceof Array
			? entryPoints
			: Object.values(entryPoints ?? {});
	return entries ?? [];
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function getLogger(name: string | BuildOptions | string[], color = clc.yellow) {
	const strName = (() => {
		if (typeof name === "string") return name;
		if (Array.isArray(name)) {
			return basename(name[0]);
		} else {
			return normalizeEntryPoints(name.entryPoints)[0].split("/").slice(-1)[0];
		}
	})();
	const formattedName = clc.black(clc.bold(clc.bgYellowBright(`[${strName}]`)));
	return (...args: unknown[]): void => {
		console.info(
			formattedName,
			...args.map((arg) => (typeof arg === "string" ? color(arg) : arg))
		);
	};
}

const renameEntryHtml: Plugin = {
	name: "rename entry html",
	setup(build) {
		build.initialOptions.metafile = true;
		const entries = normalizeEntryPoints(build.initialOptions.entryPoints);
		if (entries.length > 0) {
			const log = getLogger("rename entry", clc.magenta);
			build.onEnd(async (result) => {
				if (isServe) return;
				if (result.metafile == null) return;
				await Promise.all(
					Object.entries(result.metafile.outputs).map(
						async ([out, { inputs }]) => {
							const entry = entries.find((x) => x in inputs);
							if (entry == null || entry.length === 0)
								return await Promise.resolve();
							const dest = join(DIST, basename(entry));
							if (result.metafile == null) return await Promise.resolve();
							const oldStats = result.metafile.outputs[out];
							delete result.metafile.outputs[out]; // eslint-disable-line -- we need to mess with the metafile
							const relativeOutput = relative(DIR_NAME, dest);
							result.metafile.outputs[relativeOutput] = oldStats;
							log(`Renaming ${out} => ${relativeOutput}`);
							return await rename(out, dest);
						}
					)
				);
			});
		}
	},
};

/**
 * copy assets from ./assets to output path.
 *
 * acts as loader for paths beginnign with /assets
 *   - resolves to ./assets
 * also acts as a file loader for relative paths ending with the specified extensions.
 *   - the resolved value is then final asset URL
 *   - the file is copied to the destination's asset folder
 *   - if the importer is a javascript/typescript file, the result is a dynamically fetched request
 * @param mainEntryPoint - main entrypoint of the script. This is required to avoid duplicate work
 * @param assetsDir - location to save assets
 * @param extensions - key: extension (with . prefix), value: subdirectory in asset folder
 */
const copyAssetsPlugin = (
	mainEntryPoint: string,
	assetsDir: string,
	extensions?: Record<string, string>
): Plugin => ({
	name: "copy assets",
	async setup(build) {
		const NAMESPACE = "assets";
		assetsDir = relative(DIR_NAME, assetsDir);
		const destDir = join(DIST, assetsDir);
		const entries = normalizeEntryPoints(build.initialOptions.entryPoints);
		const isMain = entries.some((entry) => entry === mainEntryPoint);
		const log = getLogger(entries, clc.magenta);

		// copy assets folder (but only if we're the main entrypoint)
		if (isMain) {
			build.onStart(async () => {
				log(`Copying ${assetsDir} => ${destDir}`);
				await cp(assetsDir, destDir, {
					dereference: true,
					preserveTimestamps: true,
					force: true,
					recursive: true,
				});
			});
		}
		/**
		 * the public path: it needs to start with / since we're copying to root assets directory
		 */
		const publicPath =
			build.initialOptions.publicPath != null
				? build.initialOptions.publicPath || "/"
				: "/";
		// resolve files in the ./assets folder (absolute paths)
		build.onResolve(
			{ filter: /^\/assets\//, namespace: "file" },
			async (args) => {
				const basePath = args.path.slice(1);
				const real = realpath(DIR_NAME, basePath);
				const resolvedPath = join(publicPath, basePath);
				// don't do anything, since we copied all of the files over in onStart
				log(`Resolved ${real} => ${resolvedPath}`);
				return {
					path: resolvedPath,
					namespace: NAMESPACE,
					watchFiles: [real],
					external: true,
				};
			}
		);

		if (extensions) {
			const results: BuildResult["metafile"] = {
				inputs: {},
				outputs: {},
			};
			const assetNames = build.initialOptions.assetNames ?? "[name]-[hash]";
			interface CopyResult {
				resolvedPath: string;
				filePath: string;
			}
			/**
			 * copy file in `src` to assets folder (in the subdirectory `subDir`)
			 *
			 * Respects the `[name]`,`[hash]` placeholders in {BuildOptions.assetNames}
			 *
			 * @returns `resolvedPath`: URL of the asset, `filePath`: realpath of the asset
			 */
			const copy = async (src: string, subDir: string): Promise<CopyResult> => {
				/** this is the same hash as esbuild, but probably doesn't matter */
				const hash = readFile(src)
					.then((buffer) => xxhash.h32(buffer, 0x10ad1234).toString(32))
					.then((h) => h.slice(0, 8));
				const { name, ext } = parsePath(src);
				const filename = join(
					subDir,
					assetNames.replace("[name]", name).replace("[hash]", await hash) + ext
				);
				const resolvedPath = join(publicPath, assetsDir, filename);
				const filePath = join(destDir, filename);
				// don't force, since don't care if it's already copied
				await cp(src, filePath, {
					preserveTimestamps: true,
				});
				return {
					resolvedPath,
					filePath,
				};
			};
			/** map of realpaths to resolvedPaths */
			const cache: Map<string, string> = new Map();

			const isExternal: { [kind in ImportKind]: boolean } = {
				"entry-point": true,

				// css
				"import-rule": true,
				"url-token": true,

				// js
				// we need to handle these to return url to javascript
				"import-statement": false,
				"require-call": false,
				"dynamic-import": false,
				"require-resolve": false,
			};

			// register handlers for each supplied extension
			await Promise.all(
				Object.entries(extensions).map(async ([ext, subDir]) => {
					const dest = join(destDir, subDir);
					await mkdir(dest, { recursive: true });

					const pattern = new RegExp(`\\.${ext.slice(1)}$`);
					build.onResolve(
						{ filter: pattern, namespace: "file" },
						async (args) => {
							const srcPath = normalizPath(join(args.resolveDir, args.path));
							const external = isExternal[args.kind];
							const cachedPath = cache.get(srcPath);
							if (cachedPath !== undefined) {
								log(`Resolved cached ${cachedPath}`);
								return {
									path: cache.get(srcPath),
									namespace: NAMESPACE,
									external,
									watchFiles: [srcPath],
								};
							}
							const copyresult = copy(srcPath, subDir);
							const stats = stat(srcPath);

							const relativeInputPath = relative(DIR_NAME, srcPath);
							results.inputs[relativeInputPath] = {
								bytes: (await stats).size,
								imports: [],
							};

							const { resolvedPath, filePath } = await copyresult;

							results.outputs[relative(DIR_NAME, filePath)] = {
								bytes: (await stats).size,
								inputs: {
									[relativeInputPath]: {
										bytesInOutput: (await stats).size,
									},
								},
								imports: [],
								exports: [],
							};

							cache.set(srcPath, resolvedPath);
							log(`Resolved ${relativeInputPath} => ${resolvedPath}`);
							return {
								path: resolvedPath,
								namespace: NAMESPACE,
								external,
								watchFiles: [srcPath],
							};
						}
					);
				})
			);

			build.onLoad({ filter: /()/, namespace: NAMESPACE }, async (args) => {
				const contents = `
					const url = ${JSON.stringify(encodeURI(args.path))};
					export default url; 
				`;
				return {
					contents,
					loader: "js",
				};
			});

			build.onEnd(async (result) => {
				if (!result.metafile) return;
				Object.assign(result.metafile.inputs, results.inputs);
				Object.assign(result.metafile.outputs, results.outputs);
			});
		}
	},
});

const loggerPlugin = (
	name: string,
	ignoreRegex = /node_modules.*\.(js|css|ts|json)$/
): Plugin => {
	const log = getLogger(name);
	const units: Array<[number, string]> = [
		[0, ""],
		...Array(3).fill([1, "B"]),
		...Array(3).fill([1024, "KB"]),
		...Array(3).fill([1024 * 1024, "MB"]),
		...Array(3).fill([1024 * 1024 * 1024, "GB"]),
	];

	const formatBytes = (bytes: string): string => {
		const [ratio, unit] = units[bytes.length];
		const adjusted = Number(bytes) / ratio;
		return `${adjusted.toPrecision(3)}${unit}`;
	};

	const formatSizes = (size: number, totalSize: number): string => {
		const percent = (100 * size) / totalSize;
		const formattedPercent = percent < 1 ? "< 1" : percent.toPrecision(3);
		return `[${formattedPercent.padStart(5)}%: ${formatBytes(
			size.toString()
		).padStart(6)}]`;
	};

	return {
		name: "logger",
		setup(build) {
			let start: Date | undefined;
			let type: string;

			build.onStart(() => {
				type = basename(build.initialOptions.outdir ?? "");
				if (type === "dist") type = "all";
				if (start === undefined) {
					start = new Date();
					log(`Build ${type} started at ${start.toString()}`);
				}
			});

			const shouldIgnore = (path: string): boolean => ignoreRegex.test(path);

			const logOutputs = (metafile: Metafile): void => {
				const PREFIX = "  ";
				const logOutput = (message: string): void =>
					log(PREFIX + clc.greenBright(message));
				Object.entries(metafile.outputs).forEach(
					([output, { inputs, bytes: outputBytes }]) => {
						Object.keys(inputs)
							.filter((x) => !shouldIgnore(x))
							.map((input) =>
								logOutput(
									clc.bold(
										formatSizes(inputs[input].bytesInOutput, outputBytes)
									) + ` ${input} => ${output}`
								)
							);
					}
				);
				const inputSize = Object.values(metafile.inputs)
					.map(({ bytes }) => bytes)
					.reduce((a, b) => a + b)
					.toString();
				const totalSize = Object.values(metafile.outputs)
					.map(({ bytes }) => bytes)
					.reduce((a, b) => a + b)
					.toString();

				logOutput(
					`Size: ${formatBytes(inputSize)} => ${formatBytes(totalSize)}`
				);
			};

			build.onEnd(async (result) => {
				const end = Date.now();
				if (result.metafile != null) logOutputs(result.metafile);
				if (start)
					log(clc.bold(`Build ${type} took: ${end - start.getTime()}ms`));
			});
		},
	};
};

let cleaned = false;

/**
 * @param mainEntryPoint
 */
const cleanPlugin = (mainEntryPoint?: string): Plugin => {
	const cleanDist = async (): Promise<void> => {
		const pending = [];
		for await (const dir of await opendir(DIST)) {
			const path = realpath(DIST, dir.name);
			console.log(clc.red(`Removing dirty file ${clc.green(path)}`));
			pending.push(
				rm(path, {
					force: true,
					recursive: true,
				})
			);
		}
		await Promise.all(pending);
		cleaned = true;
	};
	return {
		name: "clear",
		async setup(build) {
			const entries = normalizeEntryPoints(build.initialOptions.entryPoints);
			const hasMain = mainEntryPoint !== undefined && mainEntryPoint.length > 0;
			const isMain =
				hasMain && entries.some((entry) => entry === mainEntryPoint);
			if (hasMain && isMain)
				build.onStart(() => {
					cleaned = false;
				});
			if (!cleaned) {
				if (!hasMain || isMain) {
					await cleanDist();
				}
			}
		},
	};
};

const buildOptions: BuildOptions = {
	entryPoints: ["src/index.html"],
	outdir: DIST,
	assetNames: isServe ? "[name]" : "[name]-[hash]",

	bundle: true,
	platform: "browser",
	sourcemap: isDev,
	target: ["es2020", "chrome96", "firefox95"],

	minify: !isDev,
	drop: isDev ? [] : ["debugger", "console"],
	metafile: true,
	external: ["/assets/*"],

	publicPath: publicPath,

	plugins: [
		cleanPlugin("src/index.html"),
		htmlPlugin(),
		renameEntryHtml,
		copyAssetsPlugin("src/index.html", join(DIR_NAME, "assets"), {
			".ttf": "fonts",
			".txt": "examples",
		}),
		loggerPlugin("index.html"),
	],
};

if (publicPath !== undefined)
	console.log(clc.yellow(clc.bold("public path is: ", publicPath)));

async function buildMonaco(): Promise<BuildResult> {
	const workerEntryPoints = [
		"vs/language/json/json.worker.js",
		"vs/language/css/css.worker.js",
		"vs/language/html/html.worker.js",
		"vs/language/typescript/ts.worker.js",
		"vs/editor/editor.worker.js",
	];
	return await build({
		entryPoints: workerEntryPoints.map((entry) => `monaco-editor/esm/${entry}`),
		bundle: true,
		format: "iife",
		outbase: "monaco-editor/esm/",
		outdir: DIST,
		metafile: true,
		publicPath,
		plugins: [cleanPlugin(), loggerPlugin("Monaco")],
	});
}

async function main(): Promise<void> {
	await buildMonaco();
	if (isServe) {
		await serve(
			{
				servedir: DIST,
				port: 8000,
				host: "localhost",
			},
			buildOptions
		);
	} else {
		await build(buildOptions);
	}
}

void main();
