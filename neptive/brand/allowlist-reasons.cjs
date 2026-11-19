// Reasons for the accepted brand-check findings, by rule. Used by `brand-check.mjs --update` to fill
// neptive/brand/brand-allowlist.json; a finding no rule explains gets "TODO" and the check fails.
module.exports = [
  [/getAgent\('postiz'\)|id: 'postiz'|name: 'postiz'|Symbol\.for\('postiz|service: 'gitroom'|service !== 'gitroom'|service === 'gitroom'/, 'internal identifier (Mastra agent id, Stripe metadata, symbol key): never shown, renaming breaks upstream compatibility'],
  [/@postiz\.com|nevo@postiz|agencies\.service/, 'upstream Postiz Cloud only (Stripe customers / agency directory of postiz.com); not reachable on a Neptive install without Stripe'],
  [/stripe\.service|billing\.controller|billing\/|billing\.after|faq\.component|first\.billing|lifetime/, 'billing screens and emails: only when STRIPE_PUBLISHABLE_KEY is set, which Neptive does not use; text is runtime-branded anyway'],
  [/mcp\.relay\.service|Postiz Cloud/, 'MCP relay to self-hosted instances: Postiz Cloud feature, off unless the relay env is set'],
  [/chat\/tools\/|load\.tools/, 'tool descriptions read by AI agents (MCP / copilot), not shown in the UI. Known gap: an agent may repeat "Postiz" to the user'],
  [/integrations\/social\/|no\.auth\.integrations|oauth\.service/, 'known gap: provider/integration error text stored on a failed post or channel and shown in the admin error preview (not runtime-branded yet; HttpException messages are)'],
  [/User[-_]AGENT|USER_AGENT|client_name/, 'identifies the app to third-party APIs (User-Agent, Mastodon app name): not shown to Neptive users'],
  [/organization\.service|users\.service|digest\.email|listmonk/, 'runtime-branded: emails go through neptiveEmail(), HttpException messages through NeptiveBrandErrorsInterceptor (listmonk newsletter is not configured)'],
  [/initialize\.sentry|data-domain|domain=\{|dubAnalytics/, 'analytics/monitoring identifiers (Sentry app name, Plausible/Datafast/Dub domain), only with their keys set; never shown'],
  [/linkedin\.component.*gitroom|MyPostizAgent|postiz\.example\.com/, 'placeholder text in rarely used inputs (LinkedIn company URL, Moltbook agent name, self-hosted URL). Known gap, low visibility'],
  [/href=|path: 'https:\/\/affiliate|chromewebstore|docs\.postiz|n8n-nodes|claude\.ai\/directory|cursor\.com\/marketplace|postiz\.com\/(?:terms|privacy)|gitroomhq\/postiz-app/, 'link to upstream docs/marketing: the element is hidden by brand.css (a[href*=postiz.com], gitroomhq, chromewebstore ...), or only built into a hidden link'],
  [/public\.component|onboarding\.modal/, 'upstream CLI/MCP setup data: the CLI cards are removed by brand.json `cuts` (Settings > Agents, onboarding); what remains are the MCP server label in generated client configs (identifier) and the Grok chat-only instructions. Known gap: the Grok instructions and the Claude/Cursor directory links point at the Postiz Cloud connector'],
  [/locales\/.*proudly_open_source/, 'billing FAQ text, only with Stripe; the github link inside is hidden by brand.css'],
];
