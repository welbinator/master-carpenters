import cloudflare from "@astrojs/cloudflare";
import { defineConfig, fontProviders } from "astro/config";

export default defineConfig({
	site: "https://mastercarpentersllc.com",
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
