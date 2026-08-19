import cloudflare from "@astrojs/cloudflare";
import { defineConfig, fontProviders } from "astro/config";

// Production (Cloudflare root domain): leave PAGES_BASE unset → base "/"
// Staging (GitHub Pages project site): PAGES_BASE=/master-carpenters/
// All internal links/assets use withBase() so both mounts work from one codebase.
export default defineConfig({
	site: "https://mastercarpentersllc.com",
	base: process.env.PAGES_BASE || "/",
	// Keep CSS external so any relative url() paths resolve from /_astro/, not the page URL.
	build: { inlineStylesheets: "never" },
	output: "static",
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
