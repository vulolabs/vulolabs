# Logs

## What it does

**Logs** lists every email and text message your site has tried to send: who it was for, when, which provider sent it, and whether it worked.

## Why it matters

- When a customer says "I never got the email", you can check whether it was sent and to which address.
- When something fails, the log says why, in the provider's own words.

## How to use it

1. Go to **VuloMail → Logs**.
2. The tiles at the top show **Sent**, **Failed** and **Delivery rate**.
3. Narrow the list with the controls below.
4. Click **View** on a row for the details.

### Finding a message

| Control | What it does |
|---|---|
| **All / Email / SMS** (top right) | Show one channel |
| **All / Sent / Failed** (above the table) | Show one status. The number beside each is its count |
| Date range | Show messages from chosen days |
| Search box | Find by recipient or subject |

These work together. The counts follow the channel, date range and search.

### Reading a row

| Column | Shows |
|---|---|
| **Message** | The subject (or "Text message") and who it was sent to |
| **Sent** | Date and time, then the provider and what sent it. Click the heading to sort |
| **Status** | **Sent**, **Sent via backup** or **Failed** |
| **Opened** | **Yes**, **No**, or **Not tracked** (tracking was off, the message failed, or it is a text message). A click counts as an open |
| **Clicked** | **Yes**, **No**, or **Not tracked** |

"What sent it" is the plugin or theme that created the message, for example `woocommerce`, or `core` for WordPress itself.

Dates use the date format, time format and timezone from WordPress's **Settings → General**.

### The detail popup

**View** shows the status, date, recipient, sender, provider, and the provider's own ID for the message.

- If more than one connection was tried, each attempt is listed with its result.
- If the message failed, the reason is shown.
- The message text is shown only if you have switched on **Store message content** (see below).
- For a tracked email: the first and last open, the number of opens, the first and last click, the number of clicks, and each clicked link with its own count.

| Button | What it does |
|---|---|
| **Resend** | Sends the message again through your current routing. Only available when the message content was stored and recipients were not masked |
| **Delete entry** | Removes this entry from the log |

### Clearing the log

**Delete all logs** removes every entry. You are asked to confirm. This cannot be undone.

## Settings explained

**Settings → Logging & Privacy**

| Setting | What it does | Why you might change it |
|---|---|---|
| **Keep a log of sent and failed messages** | Records each message | Switch off if you must not keep any record. The Dashboard totals then stay at zero |
| **Store message content** | Keeps the body of each message | Needed to read or resend a message later. Off by default, because messages can contain password reset links and personal details |
| **Mask recipients in the log** | Stores `j•••@example.com` instead of the full address or number | For privacy. Masked entries cannot be resent, and you cannot search for a full address |
| **Keep entries for** | Days before an entry is deleted automatically. `0` keeps entries until you delete them | Shorten it to hold less personal data; lengthen it to keep a longer history |

The log is stored in your own WordPress database and never leaves your site.

### Open and click tracking

| Setting | What it does | Why you might change it |
|---|---|---|
| **Open tracking** | Adds an invisible image to each HTML email and records when it is loaded | To see whether order or account emails are being read |
| **Click tracking** | Sends each link through your site first and records which one was clicked | To see which links people use |

Both are off until you switch them on, and both need **Keep a log of sent and failed messages**. They only apply to HTML email sent through a VuloMail connection; plain-text email and text messages are never changed. Unsubscribe, password reset, sign-in, `mailto:` and `tel:` links are never rewritten. No IP address or device details are kept, and nothing is sent to another service.

**The numbers are estimates.** Some mail apps block images, so an open can go unseen. Others, and security scanners, load images or follow links on their own, so some opens and clicks were not a person.

## Related

- [DASHBOARD](DASHBOARD.md) - recent failures at a glance.
- [TROUBLESHOOTING](TROUBLESHOOTING.md) - what common errors mean.
