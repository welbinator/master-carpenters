import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
const WEB3FORMS_KEY = "2d418359-f7b6-45e1-a983-07eda32418f0";

// ── Command Center lead notification ─────────────────────────────────────────
// After a successful insert we POST a small payload to Command Center's
// /api/push/notify, signed with HMAC-SHA256 (scheme: v0:{ts}:{body}) using the
// shared PUSH_NOTIFY_SECRET secret. CC drops it in the desktop bell and fires a
// phone Web Push. Fire-and-forget — never blocks or fails the submission.
async function hmacHex(secret: string, msg: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	);
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
	return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function notifyCommandCenter(lead: { name: string; email: string; message: string }) {
	const secret = (env as Record<string, string>).PUSH_NOTIFY_SECRET;
	if (!secret) return; // not configured — skip silently
	const url =
		(env as Record<string, string>).CC_NOTIFY_URL ||
		"https://cc.crweb.design/api/push/notify";
	try {
		const ts = Math.floor(Date.now() / 1000);
		const body = JSON.stringify({
			name: lead.name,
			email: lead.email,
			site: "mastercarpentersllc.com",
			message: lead.message,
			ts,
		});
		const sig = await hmacHex(secret, `v0:${ts}:${body}`);
		await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-CC-Signature": `t=${ts},v0=${sig}`,
			},
			body,
		});
	} catch (_) {
		// CC unreachable — the submission is already safely in D1; ignore.
	}
}

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

export const POST: APIRoute = async ({ request }) => {
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
		const db = env.DB;

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

	// 3. Notify Command Center (desktop bell + phone Web Push). Fire-and-forget.
	try {
		await notifyCommandCenter({
			name: name.trim(),
			email: email.trim(),
			message: message?.trim() || "",
		});
	} catch (err) {
		console.warn("Command Center notify error:", err);
	}

	return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
};
