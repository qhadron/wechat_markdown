import htmlPlugin from "@chialab/esbuild-plugin-html";
import clc from "cli-color";
import {
	build,
	serve,
	Plugin as EsBuildPlugin,
	BuildOptions,
	Metafile,
	BuildResult,
	ImportKind,
	PluginBuild,
	BuildIncremental,
} from "esbuild";
import {
	cp,
	opendir,
	rename,
	rm,
	mkdir,
	readFile,
	stat,
	writeFile,
} from "fs/promises";
import {
	basename,
	dirname,
	join,
	relative,
	resolve as realpath,
	parse as parsePath,
	normalize as normalizePath,
} from "path";
import { fileURLToPath } from "url";
import xxhash from "xxhashjs";
import { minify, MinifyOptions } from "terser";
import MonacoMeta from "monaco-editor/esm/metadata.js";

const DIR_NAME = dirname(fileURLToPath(import.meta.url));
const DIST = join(DIR_NAME, "dist");
const isDev = process.env.NODE_ENV === "development";

const isServe = process.argv.some((arg) => arg === "--serve");

const publicPath = isDev ? "" : process.env.PUBLIC_PATH;
const generateSourceMap = isDev || isServe;

const ecmaVersion = 2020;
const target = [`es${ecmaVersion}`, "chrome96", "firefox95"];

function nonNull<T>(x: Array<T | undefined | null>): T[] {
	return x.filter(Boolean) as T[];
}

/**
 * returns path of entrypoints, normalized from build options
 */
function normalizeEntryPoints(
	entryPoints: BuildOptions["entryPoints"]
): string[] {
	const entries =
		entryPoints instanceof Array ? entryPoints : Object.keys(entryPoints ?? {});
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

/** this is the same hash as esbuild, but probably doesn't matter */
function getFileHash(contents: string | Buffer | ArrayBuffer) {
	return xxhash.h32(contents, 0x10ad1234).toString(32).slice(0, 8);
}

const mergeBuildResults = (
	to: BuildResult | undefined,
	from: BuildResult | undefined
) => {
	if (!to || !from) return;
	if (to.stop) {
		to.stop = () => {
			to.stop?.();
			from.stop?.();
		};
	}
	to.errors.push(...from.errors);
	to.warnings.push(...from.warnings);
	if (to.rebuild) {
		const rebuild = async () => {
			const a = await to.rebuild?.();
			const b = await from.rebuild?.();
			mergeBuildResults(a, b);
			return a as BuildIncremental;
		};
		rebuild.dispose = () => {
			to.rebuild?.dispose();
			from.rebuild?.dispose();
		};
		to.rebuild = rebuild;
	}

	if (to.outputFiles) to.outputFiles.push(...(from.outputFiles ?? []));

	Object.assign(to.metafile?.inputs, from.metafile?.inputs);
	Object.assign(to.metafile?.outputs, from.metafile?.outputs);
};

interface Plugin {
	name: EsBuildPlugin["name"];
	setup?: EsBuildPlugin["setup"];
	onMain?: (build: PluginBuild) => Promise<void> | void;
}

const renameEntryHtml: Plugin = {
	name: "remove entry hash",
	onMain(build) {
		build.initialOptions.metafile = true;
		const entries = normalizeEntryPoints(build.initialOptions.entryPoints);
		if (entries.length > 0) {
			const log = getLogger("rename entry", clc.magenta);
			build.onEnd(async (result) => {
				if (isServe) return;
				if (result.metafile == null) return;
				await Promise.all(
					Object.entries(result.metafile.outputs).map(
						async ([out, { inputs, ...rest }]) => {
							// counterintuitively, entryPoint is not set for the actual entry point (html file)
							if ("entryPoint" in rest) return;
							const entry = entries.find((x) => x in inputs);
							if (entry == null || entry.length === 0) return;
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
 * Calls `{Plugin.onMain}` when this plugin is ran from the main entry point.
 * All `{Plugin.setup}` functions are called as normal.
 *
 * this is useful since the htmlPlugin calls everything all the time.
 */
const callOnMain = (
	mainEntryPoint: string | ((opts: BuildOptions) => boolean),
	plugins: Plugin[]
): EsBuildPlugin[] => {
	const mainPlugin: EsBuildPlugin = {
		name: "run on main",
		async setup(build) {
			const entries = normalizeEntryPoints(build.initialOptions.entryPoints);
			const isMain =
				typeof mainEntryPoint === "string"
					? entries.some((entry) => entry === mainEntryPoint)
					: mainEntryPoint(build.initialOptions);
			if (isMain) {
				for (const plugin of plugins) {
					mainPlugin.name = plugin.name;
					await plugin.onMain?.(build);
				}
			}
		},
	};
	return [
		mainPlugin,
		...nonNull(plugins.map((p) => p.setup && (p as EsBuildPlugin))).map(
			(p) => ({
				name: p.name,
				setup: p.setup,
			})
		),
	];
};

/**
 * copy assets from ./assets to output path.
 * @param assetsDir - location to save assets
 */
const copyAssetsPlugin = (assetsDir: string): Plugin => ({
	name: "copy assets",
	async onMain(build) {
		assetsDir = relative(DIR_NAME, assetsDir);
		const destDir = join(DIST, assetsDir);
		const entries = normalizeEntryPoints(build.initialOptions.entryPoints);
		const log = getLogger(entries, clc.magenta);

		// copy assets folder (but only if we're the main entrypoint)
		build.onStart(async () => {
			log(`Copying ${assetsDir} => ${destDir}`);
			await cp(assetsDir, destDir, {
				dereference: true,
				preserveTimestamps: true,
				force: true,
				recursive: true,
			});
		});
	},
});

/**
 * acts as loader for paths beginnign with /assets
 *   - resolves to ./assets
 * also acts as a file loader for relative paths ending with the specified extensions.
 *   - the resolved value is then final asset URL
 *   - the file is copied to the destination's asset folder
 *   - if the importer is a javascript/typescript file, the result is a dynamically fetched request
 * @param assetsDir - location to save assets
 * @param extensions - key: extension (with . prefix), value: subdirectory in asset folder
 */
const resolveAssetsPlugin = (
	assetsDir: string,
	extensions: Record<string, string>
): EsBuildPlugin => ({
	name: "resolve assets",
	async setup(build) {
		assetsDir = relative(DIR_NAME, assetsDir);
		const destDir = join(DIST, assetsDir);
		const NAMESPACE = "assets";

		const entries = normalizeEntryPoints(build.initialOptions.entryPoints);
		const log = getLogger(entries, clc.magenta);
		/**
		 * the public path: it needs to start with / since we're copying to root assets directory
		 */
		const publicPath =
			build.initialOptions.publicPath != null
				? build.initialOptions.publicPath || "/"
				: "/";
		// resolve files in the ./assets folder (absolute paths)
		build.onResolve(
			// eslint-disable-next-line prefer-regex-literals -- avoids escaping
			{ filter: new RegExp(`^/assets/`) },
			async (args) => {
				const basePath = args.path.slice(0);
				const real = realpath(DIR_NAME, basePath);
				const resolvedPath = join(publicPath, basePath);
				// don't do anything, since we copied all of the files over in onStart
				log(`Resolved ${real} => ${resolvedPath}`);
				return {
					path: resolvedPath,
					namespace: "copied-assets",
					watchFiles: [real],
					external: true,
				};
			}
		);

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
			const hash = readFile(src).then(getFileHash);
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
						const srcPath = normalizePath(join(args.resolveDir, args.path));
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
	},
});

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

const loggerPlugin = (
	name: string,
	ignoreRegex = /node_modules.*\.(js|css|ts|json)$/
): EsBuildPlugin => {
	const log = getLogger(name);
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

			const entryPoints = normalizeEntryPoints(
				build.initialOptions.entryPoints
			);

			const shouldIgnore = (path: string): boolean =>
				ignoreRegex.test(path) &&
				!entryPoints.some((entry) => path.includes(entry));

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
				const fmt =
					result.errors.length + result.warnings.length
						? clc.bold.red
						: clc.bold;
				if (start) log(fmt(`Build ${type} took: ${end - start.getTime()}ms`));
			});
		},
	};
};

/**
 * Builds (a subset of) monaco and stores it in `outPath`.
 *
 * Resolves `monaco-editor` to the javascript path, and `monaco-editor/css`
 * to the css path.
 *
 * The generated monaco build takes care of worker URLs as well.
 *
 * @param features - subset of monaco features
 * @param languages - subset of monaco's languages
 * @param plugins - plugins to use while building monaco
 * @param outPath - destination for monaco file, relative to DIST
 */
const externalMonacoPlugin = (
	features: MonacoMeta.EditorFeature[],
	languages: MonacoMeta.EditorLanguage[],
	plugins: Plugin[] = [],
	outPath: string = join("assets", "monaco", "monaco.esm.js")
): Plugin => {
	const MONACO_INSTALL = "monaco-editor/esm";

	const featuresById = Object.fromEntries(
		MonacoMeta.features.map(
			(feature) => [feature.label as MonacoMeta.EditorFeature, feature] as const
		)
	);
	const languagesById = Object.fromEntries(
		MonacoMeta.languages.map(
			(feature) => [feature.label as MonacoMeta.EditorFeature, feature] as const
		)
	);

	const featurePaths = nonNull(
		features.map((id) => featuresById[id]).flatMap((x) => x.entry)
	);
	const languagePaths = nonNull(
		languages.map((id) => languagesById[id]).flatMap((x) => x.entry)
	);
	const workerPaths = [
		...nonNull(
			languages.map((id) => languagesById[id]).map((x) => x.worker?.entry)
		),
		"vs/editor/editor.worker",
	];

	/**
	 * The main name needs to be passed from the real build to resolvers
	 * (i.e. between 2 plugins), so this is the easiest way to do that.
	 */
	const deferredMainBuild: {
		promise?: Promise<BuildResult>;
		resolve?: (_: BuildResult) => void;
	} = {};
	// eslint-disable-next-line @typescript-eslint/promise-function-async
	const mainBuild = (() => {
		deferredMainBuild.promise = new Promise<BuildResult>((resolve) => {
			deferredMainBuild.resolve = resolve;
		});
		return deferredMainBuild.promise;
	})();

	return {
		name: "external-monaco",
		async setup(build) {
			const log = getLogger("monaco-resolver", clc.magenta);
			const cache: Record<string, string> = {};
			build.onResolve(
				{ filter: /^:?monaco-editor(?:\/css)?/ },
				async (args) => {
					let resolvedPath;
					const ext = args.path.endsWith("/css") ? "css" : "js";

					if (!cache[ext]) {
						const name = basename(
							Object.keys((await mainBuild).metafile?.outputs ?? {}).find((x) =>
								x.endsWith(ext)
							) as string
						);
						resolvedPath = `${buildOptions.publicPath ?? ""}/${dirname(
							outPath
						)}/${name}`;
						cache[ext] = resolvedPath;
					}

					resolvedPath = cache[ext];
					log(`Resolved ${args.path} => ${resolvedPath}, ${args.kind}`);
					return {
						path: resolvedPath,
						external: true,
					};
				}
			);
		},
		async onMain(build) {
			const subBuild = (async () => {
				const entry = basename(outPath, ".js");
				const outdir = normalizePath(join(DIST, dirname(outPath)));
				// a real file on disk is required for esbuild to emit output
				const tempFile = join(DIST, "monaco.tmp.js");
				await writeFile(tempFile, `export * from ":monaco-entrypoint:"`);

				const publicPath = buildOptions.publicPath ?? "";

				const generateImport = (path: string) => `import "${path}";`;

				/**
				 * @see https://github.com/microsoft/monaco-editor/blob/bfb6a42e3de96fdc7a2ee4e5c6bbfad8b463efbc/webpack-plugin/src/index.ts#L282
				 * @see https://github.com/microsoft/monaco-editor/blob/bfb6a42e3de96fdc7a2ee4e5c6bbfad8b463efbc/webpack-plugin/src/loaders/include.ts#L30
				 *
				 * Note: language aliases aren't set up for workers (i.e. css, scss, less all have the same worker)
				 */
				const mainFileContents = [
					...featurePaths.map(generateImport),
					`
						import * as monaco from "vs/editor/editor.api";
						declare global {
							interface Window {
								MonacoEnvironment: monaco.Environment;
							}
						}

						self.MonacoEnvironment = {
							getWorkerUrl: function (moduleId, label) {
								${nonNull(
									languages
										.map((id) => languagesById[id])
										.map((language) => {
											if (!language.worker) return null;
											return `
										if (label === "${language.label}") {
											return "${publicPath}/${dirname(outPath)}/${language.worker.entry}.js";
										}
										`;
										})
								).join("\n")}
								return "${publicPath}/assets/monaco/vs/editor/editor.worker.js";
							},
						};
						export * from "vs/editor/editor.api";
						`,
					...languagePaths.map(generateImport),
				]
					.join("\n")
					.split("\n")
					.map((line) => line.trim())
					.join("\n");

				const entryName = `${entry}`;

				const entryPoints = {
					[entryName]: tempFile,
				};

				// TODO: build with hash
				// idea: store workers as [language, path] pairs, instead of workerPaths
				// on output, reconstruct [language, hashed] from metafile
				// then, use it to generate main file content
				const workerBuild = build.esbuild.build({
					...build.initialOptions,
					entryPoints: workerPaths.map(
						(entry) => `${MONACO_INSTALL}/${entry}.js`
					),
					bundle: true,
					format: "iife",
					outbase: "monaco-editor/esm/",
					outdir,
					metafile: true,
					publicPath,
					plugins: [loggerPlugin("monaco-workers")],
				});

				const subBuild = build.esbuild.build({
					...build.initialOptions,
					entryPoints,
					entryNames: "[name].[hash]",
					bundle: true,
					format: "esm",
					outdir,
					metafile: true,
					plugins: callOnMain(entry, [
						{
							name: "monaco-build",
							setup(build) {
								const monacoBase = join(
									DIR_NAME,
									"node_modules",
									MONACO_INSTALL
								);

								build.onResolve({ filter: /^:monaco-entrypoint:$/ }, (args) => {
									return {
										path: args.path,
										namespace: "monaco-entry",
									};
								});

								build.onResolve(
									{ filter: /()/, namespace: "monaco-entry" },
									async (args) => {
										const path = args.path.startsWith(".")
											? args.path
											: "./" + args.path;
										const result = await build.resolve(path, {
											namespace: "file",
											resolveDir: monacoBase,
										});
										result.path = normalizePath(result.path);
										return result;
									}
								);

								build.onLoad(
									{ filter: /()/, namespace: "monaco-entry" },
									() => {
										return {
											contents: mainFileContents,
											loader: "ts",
										};
									}
								);

								build.onEnd(async () => await rm(tempFile));
							},
						},
						...plugins,
						loggerPlugin("monaco-build"),
					]),
				});

				const subResults = await subBuild;

				deferredMainBuild.resolve?.(subResults);

				const workerResults = await workerBuild;

				mergeBuildResults(subResults, workerResults);
				return subResults;
			})();

			build.onEnd(async (results) => {
				const subResults = await subBuild;
				mergeBuildResults(results, subResults);
			});
		},
	};
};

const cleanPlugin = (): Plugin => {
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
	};
	return {
		name: "clear",
		async onMain() {
			await cleanDist();
		},
	};
};

const buildOptions: BuildOptions = {
	entryPoints: ["src/index.html"],
	outdir: DIST,
	assetNames: isServe ? "[name]" : "[name]-[hash]",

	bundle: true,
	platform: "browser",
	sourcemap: generateSourceMap,
	target,

	minify: !isDev,
	drop: isDev ? [] : ["debugger", "console"],
	metafile: true,
	external: ["/assets/*"],

	publicPath: publicPath,

	plugins: callOnMain(
		// just checking entry point name isn't enough:
		// the js build also starts with index.html
		(opts) => {
			return (
				normalizeEntryPoints(opts.entryPoints)[0] === "src/index.html" &&
				basename(opts.outdir ?? "") === "dist"
			);
		},
		[
			cleanPlugin(),
			htmlPlugin({
				scriptsTarget: target,
				modulesTarget: target,
			}),
			renameEntryHtml,
			copyAssetsPlugin(join(DIR_NAME, "assets")),
			resolveAssetsPlugin(join(DIR_NAME, "assets"), {
				".txt": "examples",
			}),
			externalMonacoPlugin(
				// to enable all features: MonacoMeta.features.map((feat) => feat.label as EditorFeature),
				[
					"contextmenu",
					"clipboard",
					"colorPicker",
					"comment",
					"bracketMatching",
					"dnd",
					"find",
					"inPlaceReplace",
					"folding",
					"hover",
					"parameterHints",
					"smartSelect",
					"suggest",
					"wordOperations",
					"wordPartOperations",
				],
				["css", "markdown"],
				[
					resolveAssetsPlugin(join(DIR_NAME, "assets"), {
						".ttf": "fonts",
					}),
				]
			),
			loggerPlugin("main"),
		]
	),
};

if (publicPath !== undefined)
	console.log(clc.yellow(clc.bold("public path is: ", publicPath)));

async function runTerser(results: BuildResult[]): Promise<void> {
	const log = getLogger("terser");

	const nameCache = {};
	const options: MinifyOptions = {
		ecma: ecmaVersion,
		keep_classnames: false,
		keep_fnames: false,
		nameCache,
		module: false,
		toplevel: true,
		compress: {
			arguments: true,
			booleans_as_integers: true,
			drop_console: true,
			drop_debugger: true,
			ecma: ecmaVersion,
			hoist_funs: true,
			passes: 1,
			unsafe_arrows: true,
			unsafe_comps: true,
			unsafe_Function: true,
			unsafe_methods: true,
			unsafe_proto: true,
		},
		mangle: {},
		format: {
			beautify: false,
			ecma: ecmaVersion,
			comments: /license/i,
			shebang: false,
		},
	};

	function notNull<T>(val: T | null | undefined): val is T {
		if (val === null || val === undefined) return false;
		return true;
	}

	const exts = ["js"];
	function filter(path: string): boolean {
		if (exts.some((ext) => path.endsWith(ext))) return true;
		return false;
	}

	const files = results
		.map((result) => result.metafile)
		.filter(notNull)
		.flatMap((metafile: Metafile) =>
			Object.keys(metafile.outputs)
				.filter(filter)
				.map((key) => [key, readFile(key, { encoding: "utf8" })] as const)
		);

	const sizes = await Promise.all(
		files.map(async ([path, file]) => {
			const start = Date.now();
			log(clc.white(`${path}`));
			const oldStats = stat(path);
			const result = await minify(
				{ path: await file },
				{
					...options,
					nameCache,
					module: path.endsWith(".esm.js"),
					sourceMap: generateSourceMap
						? {
								url: `/${relative(DIST, `${path}.map`)}`,
								content: await readFile(`${path}.map`, { encoding: "utf8" }),
						  }
						: undefined,
				}
			);
			if (result.code == null) {
				log(clc.red(`Minify ${path} returned no code!`));
				return [0, 0];
			}
			const writes = [];
			if (result.map != null) {
				writes.push(writeFile(`${path}.map`, result.map as string, "utf8"));
			}
			writes.push(writeFile(path, result.code, "utf8"));
			await Promise.all(writes);
			const end = Date.now();
			const newStats = stat(path);
			log(
				formatSizes((await newStats).size, (await oldStats).size),
				path,
				`[${end - start}ms]`
			);
			return [(await oldStats).size, (await newStats).size];
		})
	);

	const [inputSize, outputSize] = sizes.reduce((a, b) => [
		a[0] + b[0],
		a[1] + b[1],
	]);

	log(
		`Size: ${formatBytes(inputSize.toString())} => ${formatBytes(
			outputSize.toString()
		)}`
	);
}

async function main(): Promise<void> {
	if (isServe) {
		await serve(
			{
				servedir: DIST,
				port: 8000,
				host: "localhost",
			},
			buildOptions
		);
		return;
	}

	const buildResults = await build(buildOptions);

	if (!isDev) {
		await runTerser([buildResults]);
	}
}

main().catch(() => process.exit(1));
