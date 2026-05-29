// @ts-nocheck
/**
 * One-time OAuth: place credentials.json (Desktop OAuth client) in configs/, then run:
 *   npm run gmail-auth
 */
import fs from "node:fs";
import http from "node:http";
import { google } from "googleapis";
import open from "open";
import { projectPaths } from "./config";
import { log, logBanner } from "./logger";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

async function main() {
  logBanner("pay-credit-cards · Gmail OAuth", "One-time token setup");
  log.header("Pre-flight");

  const credPath = projectPaths.credentialsJson;
  if (!fs.existsSync(credPath)) {
    log.error(
      `Missing ${credPath}. Create an OAuth 2.0 Client ID (Desktop app) in Google Cloud Console and download JSON.`
    );
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(credPath, "utf8"));
  const installed = raw.installed ?? raw.web;
  if (!installed) {
    log.error("credentials.json must contain installed or web client settings.");
    process.exit(1);
  }
  log.success("Found credentials.json");
  const { client_id, client_secret } = installed;
  const redirectUri = "http://127.0.0.1:8765/oauth2callback";
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(8765, "127.0.0.1", () => resolve());
  });

  server.on("request", async (req, res) => {
    if (!req.url?.startsWith("/oauth2callback")) return;
    const url = new URL(req.url, "http://127.0.0.1");
    const code = url.searchParams.get("code");
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("You can close this tab and return to the terminal.");
    server.close();
    if (!code) {
      log.error("No code in callback URL.");
      process.exit(1);
    }
    const { tokens } = await oauth2Client.getToken(code);
    fs.mkdirSync(projectPaths.configsDir, { recursive: true });
    fs.writeFileSync(projectPaths.tokenJson, JSON.stringify(tokens, null, 2));
    log.header("Done");
    log.success(`Saved tokens to ${projectPaths.tokenJson}`);
    process.exit(0);
  });

  log.header("Authorize");
  log.info("Opening browser for Gmail authorization…");
  log.detail("Local callback: http://127.0.0.1:8765/oauth2callback");
  await open(authUrl);
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  log.error(msg);
  process.exit(1);
});
