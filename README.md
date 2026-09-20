# ResumeBoost public deployment

This version removes the Anthropic API-key field from the browser.

## What changed

- The Anthropic key is stored as a server environment variable instead of localStorage/client code.
- Visitors get a limited preview from `/api/generate`.
- Full documents are returned only after the server verifies the Gumroad license.
- Gumroad verification uses `/v2/licenses/verify` with `product_permalink=ojclf` and `increment_uses_count=false`.
- The Claude artifact is no longer the public runtime. Host these files on a platform that supports the `functions/api/generate.js` serverless function.
- The current configured model is `claude-sonnet-4-6`.

## Cloudflare Pages

1. Put `index.html`, `README.md`, and the `functions/` folder in a GitHub repository or upload them to a Pages project.
2. Create a Pages project for the repository.
3. Add these environment variables/secrets in the Pages project settings:
   - `ANTHROPIC_API_KEY` = your Anthropic API key
   - `GUMROAD_PRODUCT_PERMALINK` = `ojclf`
4. Deploy.
5. Open the Pages URL directly and test it in an incognito/private browser window.

Do not put `ANTHROPIC_API_KEY` inside `index.html`, JavaScript shipped to the browser, GitHub, or a public environment file.

## Important before advertising it

The server-side key is protected from visitors, but a public AI endpoint can still be abused to consume API credits. Add platform-level rate limiting/bot protection before widely promoting the site. A stronger version can add a daily free-preview limit and Cloudflare Turnstile.
