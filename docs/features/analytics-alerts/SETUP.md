# Setup

## Prereqs
- Telegram bot created via BotFather
- Auto-Flow server has outbound access to https://api.telegram.org

## Enable alerts (per project)
1) Open /p/:slug/alerts
2) Paste the bot token and click Start
3) Copy the generated link
4) Open the link and run /start <token> in Telegram
5) Confirm status shows connected and enabled

## Disable or rotate
- Click Disable to stop sending
- Use Regenerate link to rebind to a new chat
- Clear the bot token to disable instance-wide alerting

## Local dev
- Run npm run dev
- Use ngrok or a public URL if the Telegram client is not on the same network
