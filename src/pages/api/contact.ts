import type { APIRoute } from "astro";
const WEB3FORMS_KEY = "2d418359-f7b6-45e1-a983-07eda32418f0";

// Generate a ULID-compatible ID
function makeId(): string {
	const t = Date.now();
	const chars = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
	let id = "";
	let time = t;
	for (let i = 9; i >= 0; i--) {
		id = chars[time % 32] + id;
		time = Math.floor(time / 32);
	}
	for (let i = 0; i < 16; i++) {
		id += chars[Math.floor(Math.random() * 32)];
	}
	return id;
}

export const POST: APIRoute = async ({ request, locals }) => {
	const headers = { "Content-Type": "application/json" };

	// Parse request body
	let body: Record<string, string>;
	try {
		const ct = request.headers.get("content-type") || "";
		if (ct.includes("application/json")) {
			body = await request.json();
		} else {
			const fd = await request.formData();
			body = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
		}
	} catch {
		return new Response(JSON.stringify({ ok: false, error: "Invalid request body" }), { status: 400, headers });
	}

	const { name, email, phone, project, message } = body;

	// Validate required fields
	if (!name?.trim() || !email?.trim()) {
		return new Response(JSON.stringify({ ok: false, error: "Name and email are required" }), { status: 422, headers });
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return new Response(JSON.stringify({ ok: false, error: "Invalid email address" }), { status: 422, headers });
	}

	// 1. Save to D1
	try {
		const db = locals.runtime?.env?.DB;

		if (!db) {
			return new Response(JSON.stringify({ ok: false, error: "DB binding not available — check Cloudflare Pages bindings" }), { status: 500, headers });
		}

		const id = makeId();
		const now = new Date().toISOString();
		const slug = `submission-${id.toLowerCase()}`;

		await db
			.prepare(
				`INSERT INTO ec_contact_submissions
					(id, slug, status, created_at, updated_at, published_at, version, locale, translation_group, name, email, phone, project, message)
				VALUES (?, ?, 'published', ?, ?, ?, 1, 'en', ?, ?, ?, ?, ?, ?)`
			)
			.bind(id, slug, now, now, now, id, name.trim(), email.trim(), phone?.trim() || "", project || "", message?.trim() || "")
			.run();
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error("D1 save error:", msg);
		return new Response(JSON.stringify({ ok: false, error: `D1 error: ${msg}` }), { status: 500, headers });
	}

	// 2. Send email notification via Web3Forms (non-fatal)
	try {
		const w3res = await fetch("https://api.web3forms.com/submit", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				access_key: WEB3FORMS_KEY,
				subject: `New contact form submission from ${name}`,
				from_name: "Master Carpenters Website",
				name,
				email,
				phone: phone || "Not provided",
				project: project || "Not specified",
				message: message || "No message",
			}),
		});
		const w3data = (await w3res.json()) as { success: boolean };
		if (!w3data.success) console.warn("Web3Forms notification failed:", w3data);
	} catch (err) {
		console.warn("Web3Forms notification error:", err);
	}

	return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
};
