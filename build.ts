// @ts-check
import htmlPlugin from "@chialab/esbuild-plugin-html";
import clc from "cli-color";
import {
	build,
	serve,
	Plugin,
	BuildOptions,
	Metafile,
	BuildResult,
} from "esbuild";
import { cp, opendir, rename, rm } from "fs/promises";
import { basename, dirname, join, relative, resolve as realpath } from "path";
import { fileURLToPath } from "url";

const DIR_NAME = dirname(fileURLToPath(import.meta.url));
const DIST = join(DIR_NAME, "dist");
const isDev = process.env.NODE_ENV === "development";

const isServe = process.argv.some((arg) => arg === "--serve");

const publicPath = isDev ? "" : process.env.PUBLIC_PATH;

const renameEntryHtml: Plugin = {
	name: "rename entry html",
	setup(build) {
		build.initialOptions.metafile = true;
		const entryPoints = build.initialOptions.entryPoints;
		const entries =
			entryPoints instanceof Array
				? entryPoints
				: Object.values(entryPoints ?? {});

		if (entries.length > 0) {
			build.onEnd(async (result) => {
				if (isServe) return;
				if (result.metafile == null) return;
				await Promise.all(
					Object.entries(result.metafile.outputs).map(
						async ([out, { inputs }]) => {
							const entry = entries.find((x) => x in inputs);
							if (entry == null || entry.length === 0)
								return await Promise.resolve();
							const dest = join(DIST, "index.html");
							if (result.metafile == null) return await Promise.resolve();
							const oldStats = result.metafile.outputs[out];
							delete result.metafile.outputs[out]; // eslint-disable-line
							result.metafile.outputs[relative(DIR_NAME, dest)] = oldStats;
							return await rename(out, dest);
						}
					)
				);
			});
		}
	},
};

const moveAssetsPlugin: Plugin = {
	name: "move assets",
	setup(build) {
		const publicPath = build.initialOptions.publicPath ?? "";
		const destDir = DIST;

		build.onResolve(
			{ filter: /^\/assets\//, namespace: "file" },
			async (args) => {
				const basePath = args.path.slice(1);
				const real = realpath(DIR_NAME, basePath);
				const dest = realpath(destDir, basePath);
				await cp(real, dest, {
					dereference: true,
					preserveTimestamps: true,
					force: true,
				});
				return {
					path: `${publicPath}/${basePath}`,
					namespace: "assets",
					watchFiles: [real],
					external: true,
				};
			}
		);
	},
};

const loggerPlugin = (name: string, ignoreRegex = /node_modules/): Plugin => {
	const log = (...args: unknown[]): void => {
		console.info(
			clc.black(clc.bold(clc.bgYellowBright(`[${name}]`))),
			...args.map((arg) => (typeof arg === "string" ? clc.yellow(arg) : arg))
		);
	};
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
									) + `${input} => ${output}`
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
				const duration = Date.now() - start!.getTime(); // eslint-disable-line @typescript-eslint/no-non-null-assertion
				if (result.metafile != null) logOutputs(result.metafile);
				log(clc.bold(`Build ${type} took: ${duration}ms`));
			});
		},
	};
};

let cleaned = false;

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
		async setup() {
			if (cleaned) return;
			await cleanDist();
			cleaned = true;
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

	loader: {
		".txt": "text",
		".ttf": "file",
		".png": "file",
	},
	publicPath: publicPath,

	plugins: [
		cleanPlugin(),
		htmlPlugin(),
		moveAssetsPlugin,
		renameEntryHtml,
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
		publicPath: publicPath,
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
