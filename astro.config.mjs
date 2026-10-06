import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";
import { defineConfig, fontProviders } from "astro/config";

// Production (Cloudflare root domain): leave PAGES_BASE unset → base "/"
// Staging (GitHub Pages project site): PAGES_BASE=/master-carpenters/
// All internal links/assets use withBase() so both mounts work from one codebase.
export default defineConfig({
	site: "https://mastercarpentersllc.com",
	base: process.env.PAGES_BASE || "/",
	// Inline all CSS into <head> to eliminate render-blocking stylesheet requests (FCP/LCP win).
	// Safe here: audited /_astro/*.css contains ZERO relative url() paths, so nothing depends on
	// the /_astro/ base. If a url() is ever added to CSS, revert to "never" or use absolute/data URLs.
	build: { inlineStylesheets: "always" },
	output: "static",
	integrations: [
		// Only emit a sitemap on production root builds. Staging (GitHub Pages,
		// PAGES_BASE set) ships a blocking robots.txt and must not advertise URLs.
		...(process.env.PAGES_BASE ? [] : [sitemap()]),
	],
	adapter: cloudflare({
		platformProxy: { enabled: true },
		imageService: "compile",
	}),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	fonts: [
		{
			provider: fontProviders.google(),
			name: "Inter",
			cssVariable: "--font-body",
			weights: [400, 500, 600, 700, 800],
			fallbacks: ["sans-serif"],
		},
	],
	devToolbar: { enabled: false },
});
