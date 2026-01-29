# Open Questions

- Should alerts be per project or per user? (MVP is per project)
- Should we support multiple chat_ids (group + DM)?
- Should we add rate limiting or aggregation windows for bursts?
- Which additional triggers are required (queue depth, webhook inactivity, CI stuck)?
- Do we need alert severity levels and filtering?
- Should we store alert deliveries for audit and dedupe?
- Should the bot token be instance-wide only, or allow per-project tokens?
