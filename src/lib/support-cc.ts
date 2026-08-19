import { env } from "cloudflare:workers";

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

export type SupportTicketNotify = {
	id: string;
	site_id: string;
	site: string;
	subject: string;
	message: string;
	page_url?: string;
	user_email: string;
	user_name: string;
	status?: string;
	created_at: string;
};

/** Fire-and-forget ticket webhook to Command Center. Never throws to caller. */
export async function notifySupportTicket(ticket: SupportTicketNotify): Promise<void> {
	const secret = (env as Record<string, string | undefined>).PUSH_NOTIFY_SECRET;
	if (!secret) return;
	const url =
		(env as Record<string, string | undefined>).CC_SUPPORT_URL ||
		(env as Record<string, string | undefined>).CC_NOTIFY_URL?.replace(
			/\/api\/push\/notify$/,
			"/api/support/notify"
		) ||
		"https://cc.crweb.design/api/support/notify";
	try {
		const ts = Math.floor(Date.now() / 1000);
		const body = JSON.stringify({
			id: ticket.id,
			site_id: ticket.site_id,
			site: ticket.site,
			subject: ticket.subject,
			message: ticket.message,
			page_url: ticket.page_url || "",
			user_email: ticket.user_email,
			user_name: ticket.user_name,
			status: ticket.status || "new",
			created_at: ticket.created_at,
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
	} catch {
		// CC down — ticket already saved locally
	}
}
