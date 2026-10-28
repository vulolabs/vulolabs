# Settings

## What it does

**VuloMail → Settings** holds everything you configure. It is split into sub-tabs along the top.

## Why it matters

Most sites only need Connections and a sender email. The rest lets you decide how much is logged and what is kept.

## How to use it

1. Go to **VuloMail → Settings**.
2. Pick a sub-tab.
3. Change what you need.

**There is no Save button.** On every sub-tab except Connections, a change saves by itself a moment after you make it, and a "Settings saved" notice appears. On Connections, each button acts straight away.

To find a setting quickly, type its name in the search box at the top of the screen.

## Sub-tabs

| Sub-tab | What is there | Guide |
|---|---|---|
| **Connections** | Your email and SMS providers; which is primary and backup | [CONNECTIONS](CONNECTIONS.md) |
| **Email** | Routing on/off, sender email and name, last resort | [EMAIL](EMAIL.md) |
| **SMS** | SMS on/off, default country code, admin phone number | [SMS-ALERTS](SMS-ALERTS.md) |
| **Logging & Privacy** | What the log keeps and for how long | [LOGS](LOGS.md) |
| **Data** | What happens to your data on uninstall | below |

The alerts themselves are on their own menu item, **VuloMail → SMS Alerts**.

## Settings explained

### Email

| Setting | Default | What it does |
|---|---|---|
| Send email through VuloMail | On | Routes your site's email through your primary connection |
| Fall back to the WordPress default mailer | On | Tries WordPress's own mailer when the primary and backup both fail |
| Sender email | empty | The address your email is sent from |
| Sender name | empty | The name your email is sent from |
| Always use this sender email | Off | Overrides a From address set by a plugin |
| Always use this sender name | Off | Overrides a From name set by a plugin |

### SMS

| Setting | Default | What it does |
|---|---|---|
| Send SMS through VuloMail | On | Master switch for all text messages |
| Default country code | empty | Added to numbers written without one |
| Admin phone number | empty | Where alerts for you are sent |

### Logging & Privacy

| Setting | Default | What it does |
|---|---|---|
| Keep a log of sent and failed messages | On | Records each message |
| Store message content | Off | Keeps message bodies, so you can read and resend them |
| Mask recipients in the log | Off | Stores a masked address or number |
| Keep entries for | 30 days | Older entries are deleted automatically; `0` keeps them |
| Open tracking | Off | Records when an HTML email is opened. Needs the log |
| Click tracking | Off | Records which links in an HTML email are clicked. Needs the log |

### Data

| Setting | Default | What it does |
|---|---|---|
| When VuloMail is deleted: **Keep data** | Selected | Deleting the plugin leaves your connections, settings and log in place, so reinstalling picks up where you left off |
| When VuloMail is deleted: **Delete everything** | | Deleting the plugin removes your connections, settings and log permanently |

Deactivating the plugin never deletes anything. This setting only applies when you delete the plugin from the Plugins screen.

## Related

- [GETTING-STARTED](GETTING-STARTED.md) - the two settings every site needs.
- [TROUBLESHOOTING](TROUBLESHOOTING.md) - reset or remove VuloMail.
