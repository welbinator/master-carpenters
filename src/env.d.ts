/// <reference types="astro/client" />

type D1Database = import("@cloudflare/workers-types").D1Database;

type Runtime = import("@astrojs/cloudflare").Runtime<{
	DB: D1Database;
	MEDIA: import("@cloudflare/workers-types").R2Bucket;
}>;

declare namespace App {
	interface Locals extends Runtime {}
}
