export const prerender = false;

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { makeId, requireUser } from "../../../lib/support-auth";
import { notifySupportTicket } from "../../../lib/support-cc";

const SITE_ID = "master-carpenters";
const SITE_HOST = "mastercarpentersllc.com";

function json(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function clean(v: unknown, max: number): string {
	if (typeof v !== "string") return "";
	return v.trim().slice(0, max);
}

export const GET: APIRoute = async ({ request }) => {
	const user = await requireUser(request);
	if (!user) return json({ ok: false, error: "Not authenticated" }, 401);

	const db = env.DB;
	if (!db) return json({ ok: false, error: "Database unavailable" }, 500);

	try {
		const { results } = await db
			.prepare(
				`SELECT id, subject, message, page_url, status, created_at, updated_at
				 FROM support_tickets
				 WHERE user_id = ?
				 ORDER BY created_at DESC
				 LIMIT 100`
			)
			.bind(user.id)
			.all();
		return json({ ok: true, tickets: results || [] });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error("support tickets list error:", msg);
		return json({ ok: false, error: "Could not load requests" }, 500);
	}
};

export const POST: APIRoute = async ({ request }) => {
	const user = await requireUser(request);
	if (!user) return json({ ok: false, error: "Not authenticated" }, 401);

	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: "Invalid JSON" }, 400);
	}

	const subject = clean(body.subject, 200);
	const message = clean(body.message, 8000);
	const page_url = clean(body.page_url, 500);

	if (!subject) return json({ ok: false, error: "Subject is required" }, 422);
	if (!message) return json({ ok: false, error: "Please describe what you need" }, 422);

	const db = env.DB;
	if (!db) return json({ ok: false, error: "Database unavailable" }, 500);

	const id = makeId("tkt");
	const now = new Date().toISOString();
	const status = "new";

	try {
		await db
			.prepare(
				`INSERT INTO support_tickets
					(id, user_id, user_email, user_name, subject, message, page_url, status, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				id,
				user.id,
				user.email,
				user.name || "",
				subject,
				message,
				page_url || "",
				status,
				now,
				now
			)
			.run();
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error("support ticket insert error:", msg);
		return json({ ok: false, error: "Could not save request" }, 500);
	}

	// Notify Command Center (source of truth for James's inbox)
	try {
		await notifySupportTicket({
			id,
			site_id: SITE_ID,
			site: SITE_HOST,
			subject,
			message,
			page_url,
			user_email: user.email,
			user_name: user.name || "",
			status,
			created_at: now,
		});
	} catch (err) {
		console.warn("support CC notify error:", err);
	}

	return json({
		ok: true,
		ticket: {
			id,
			subject,
			message,
			page_url,
			status,
			created_at: now,
			updated_at: now,
		},
	});
};
