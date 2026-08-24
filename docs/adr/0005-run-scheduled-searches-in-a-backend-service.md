# Delegate scheduled searches to a separate service API

Scheduled Idea Searches must execute and send email notifications even when Chrome is closed, so a separate service API will own user signup and authentication, server-side scheduling, AI execution and provider credentials, durable result storage, email delivery, and extension result synchronization rather than relying on `chrome.alarms`. The user's local OpenRouter, Gemini, and Groq Provider Credentials will never be uploaded for scheduling; the service defines and protects its own execution credentials and account data.
