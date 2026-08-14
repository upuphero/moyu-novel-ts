// @ts-check
const esbuild = require('esbuild');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** Extension Host bundle（输出 dist/extension.js） */
async function buildExtensionHost(ctxs) {
	const ctx = await esbuild.context({
		entryPoints: ['./src/extension.ts'],
		bundle: true,
		outfile: './dist/extension.js',
		platform: 'node',
		format: 'cjs',
		external: ['vscode'],
		sourcemap: production ? 'external' : true,
		minify: production,
		drop: production ? ['console', 'debugger'] : [],
		logLevel: 'info',
	});
	ctxs.push(ctx);
}

/**
 * WebView bundle（P8-01：输出 static/js/webview.bundle.js）。
 * - WebView 侧 TS（src/webview/*.ts + src/shared/contract.ts）编译为浏览器可执行 bundle；
 * - 浏览器环境（platform: browser），IIFE 输出（webView.html 以普通 script 引用，无需 module）；
 * - 源文件 static/js/*.js 不再承载业务逻辑（P8 gate），由本 bundle 取代。
 */
async function buildWebView(ctxs) {
	const ctx = await esbuild.context({
		entryPoints: ['./src/webview/main.ts'],
		bundle: true,
		outfile: './static/js/webview.bundle.js',
		platform: 'browser',
		format: 'iife',
		sourcemap: production ? false : 'inline',
		minify: production,
		drop: production ? ['console', 'debugger'] : [],
		logLevel: 'info',
		target: ['chrome90', 'edge90'],
		// WebView 依赖注入的全局（acquireVsCodeApi 等）不打包
		external: [],
	});
	ctxs.push(ctx);
}

async function main() {
	const ctxs = [];
	await buildExtensionHost(ctxs);
	await buildWebView(ctxs);

	if (watch) {
		console.log('Watching for changes...');
		await Promise.all(ctxs.map((ctx) => ctx.watch()));
	} else {
		await Promise.all(ctxs.map((ctx) => ctx.rebuild()));
		await Promise.all(ctxs.map((ctx) => ctx.dispose()));
		console.log(production ? 'Production build complete!' : 'Build complete!');
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
