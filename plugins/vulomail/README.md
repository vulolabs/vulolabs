# VuloMail – SMTP, Email Logs & SMS Notifications #
**Contributors:** [vulolabs](https://profiles.wordpress.org/vulolabs/)  
**Tags:** smtp, email logs, sms, woocommerce, email  
**Requires at least:** 6.7  
**Tested up to:** 7.1.3  
**Requires PHP:** 8.1  
**Stable tag:** 1.0.0  
**License:** GPLv2 or later  
**License URI:** https://www.gnu.org/licenses/gpl-2.0.html  

WordPress SMTP, email logs and SMS notifications for WooCommerce, with backup email connections and tools to troubleshoot sending failures.

## Description ##

VuloMail is a WordPress SMTP, email logging and SMS notification plugin that helps you send website emails, troubleshoot sending failures and keep customers updated about their WooCommerce orders.

Connect WordPress to an SMTP server or a supported email service for password resets, order emails, contact form notifications and other transactional emails. Add a backup email connection, see what happened to each message and receive SMS alerts for important website and store activity.

WordPress not sending emails? VuloMail helps you check your email settings, send a test email and find the provider’s error message so you know what needs attention.

No VuloLabs account, subscription or additional plugin is required for core email functionality. You connect your own email or SMS provider. Provider charges and sending limits may apply.

### WordPress SMTP and email providers ###

Send WordPress emails through your chosen email service. Connect over SMTP, or directly to a native API integration: SendGrid, Mailgun, Brevo, Postmark, Amazon SES, Elastic Email, Mailjet, MailerSend, Maileroo, Mailtrap, Mandrill, Netcore, Resend, SendLayer, SparkPost, SMTP2GO, ZeptoMail, SocketLabs, SendPulse, Bird, Mailercloud, Sweego and Emailit.

- **Native API connections:** Pick a provider, paste its API key (and any other field it requires), and save - no host, port or encryption to configure.
- **SMTP:** Configure your own host, port, authentication and SSL/TLS or STARTTLS encryption, or pick a one-click preset for Gmail, Google Workspace, Outlook.com, Microsoft 365, Zoho Mail, Yahoo Mail, iCloud Mail, AOL Mail, Yandex Mail, Fastmail, Titan Email, Purelymail, Migadu, Namecheap Private Email, Rackspace Email, Amazon WorkMail or Cloudflare Email Sending - each preset fills in the host, port and encryption, and asks only for your address and password (an app password where the provider requires one).
- **Sender settings:** Set your sender email address and sender name, with optional overrides for values supplied by other plugins.

Every connection form asks only for what that provider actually requires, and saving is always the same single step. Provider charges, sending limits and authentication requirements are set by the provider, not VuloMail.

VuloMail works with emails sent through the standard WordPress wp_mail() function, including WooCommerce emails and contact form notifications. Plugins that send directly through their own email service are not affected.

### Backup email connections and automatic failover ###

Give important emails another sending route when your primary connection fails.

- **Choose a primary email connection** and a backup connection.
- **Automatically try the backup** if the primary connection reports a failure.
- Optionally use the **WordPress default mailer** as a final fallback.
- See **every sending attempt** within a single log entry.
- Identify **messages sent through your backup connection**.

### Email logs and SMS logs ###

See which messages were sent, which failed and what went wrong. Review email and SMS activity together in your WordPress dashboard.

- **Search logs** by recipient or email subject.
- **Filter messages** by channel, status and date range.
- View the **recipient, sender, provider, time and sending source**.
- Read **provider error messages** and inspect individual sending attempts.
- Find the **provider’s message ID** for further investigation.
- Optionally **store message content** and resend eligible messages.
- Choose **how long logs are kept**, with automatic cleanup of older entries.

Resending requires stored message content and unmasked recipients. A “Sent” status means the provider accepted the message; it does not confirm delivery to an inbox or phone.

### WordPress SMS notifications ###

Receive text alerts for important activity without checking your dashboard. Connect Twilio, Vonage, Plivo or Clickatell and choose which SMS alerts to enable.

- **New user registrations**.
- **Administrator logins**.
- **New comments**, excluding spam.
- **Email sending failures**, limited to one alert every 15 minutes.

Customize alert messages with supported placeholders, such as your site name, username or email subject.

### WooCommerce SMS alerts and order notifications ###

Keep your store team and customers informed about order activity.

- **Store alerts:** Receive SMS notifications for new orders, failed payments, cancellations and refunds.
- **Stock alerts:** Get notified about low stock, out-of-stock products and backorders.
- **Review alerts:** Receive a text when a new product review is submitted.
- **Customer order notifications:** Send SMS updates for processing, completed, refunded and cancelled orders.
- **Additional order updates:** Notify customers about other order status changes, including custom statuses, and customer-facing order notes.
- **Editable messages:** Personalize notifications with supported order, customer and product details.

Store and customer alerts require WooCommerce. All SMS alerts are off by default. Enable customer notifications only for customers who have consented to receive texts. Your SMS provider’s charges apply.

### Test emails and troubleshoot sending problems ###

Find configuration problems with built-in email tests and diagnostics.

- **Send a test email** through your live routing or a specific connection.
- **Test an SMS connection** using an international phone number.
- Check **primary and backup email routing**.
- Identify **missing connection details and conflicting email plugins**.
- Review sender settings and sender-domain **SPF and DMARC records**.
- Check **recent sending failures, logging, server requirements and scheduled tasks**.
- Follow relevant **troubleshooting hints** from the diagnostics screen.

DKIM verification is handled through your email provider’s dashboard.

### Privacy controls and local log storage ###

Control what VuloMail stores on your website.

- Keep email and SMS logs in **your own WordPress database**.
- Leave **message content storage** off, or enable it when needed.
- **Mask recipient details** in logs.
- Set **log retention** and delete entries.
- Store provider **passwords and API keys encrypted** in the database.
- Choose whether plugin data is **kept or removed when uninstalling**.

VuloMail makes no tracking calls and does not contact VuloLabs servers. Sending messages requires sharing the necessary message data with the providers you connect.

## External services ##

VuloMail only contacts a service after you add a connection for it and a message is sent through that connection. It then sends that message (recipients, sender, subject, body, attachments, or the phone number and text) and your credentials for that service.

Native API connections:

* SendGrid, api.sendgrid.com - [Terms](https://www.twilio.com/en-us/legal/tos), [Privacy](https://www.twilio.com/en-us/legal/privacy)
* Mailgun, api.mailgun.net / api.eu.mailgun.net - [Terms](https://www.mailgun.com/legal/terms/), [Privacy](https://www.mailgun.com/legal/privacy-policy/)
* Brevo, api.brevo.com - [Terms](https://www.brevo.com/legal/termsofuse/), [Privacy](https://www.brevo.com/legal/privacypolicy/)
* Postmark, api.postmarkapp.com - [Terms](https://postmarkapp.com/terms-of-service), [Privacy](https://postmarkapp.com/privacy-policy)
* Elastic Email, api.elasticemail.com - [Terms](https://elasticemail.com/resources/terms/terms-of-use/), [Privacy](https://elasticemail.com/resources/terms/privacy-policy/)
* Mailjet, api.mailjet.com - [Terms](https://www.mailjet.com/legal/terms/), [Privacy](https://www.mailjet.com/legal/privacy-policy/)
* MailerSend, api.mailersend.com - [Terms](https://www.mailersend.com/legal/terms-of-service), [Privacy](https://www.mailersend.com/legal/privacy-policy)
* Maileroo, smtp.maileroo.com - [Acceptable use](https://maileroo.com/aup), [Privacy](https://maileroo.com/privacy-policy)
* Mailtrap, send.api.mailtrap.io - [Terms](https://mailtrap.io/terms/), [Privacy](https://mailtrap.io/privacy/)
* Mandrill (Mailchimp Transactional), mandrillapp.com - [Terms](https://www.mailchimp.com/legal/terms/), [Privacy](https://www.mailchimp.com/legal/privacy/)
* Netcore Email API, api.pepipost.com - [Terms](https://netcorecloud.com/terms-of-service/), [Privacy](https://netcorecloud.com/privacy-policy/) (site blocks automated verification - URLs unconfirmed, check directly)
* Resend, api.resend.com - [Terms](https://resend.com/legal/terms-of-service), [Privacy](https://resend.com/legal/privacy-policy)
* SendLayer, console.sendlayer.com - [Acceptable use](https://sendlayer.com/aup/), [Privacy](https://sendlayer.com/privacy-policy/)
* SparkPost, api.sparkpost.com / api.eu.sparkpost.com - [Terms](https://www.sparkpost.com/policies/terms/), [Privacy](https://www.sparkpost.com/policies/privacy/)
* SMTP2GO, api.smtp2go.com - [Terms](https://www.smtp2go.com/terms/), [Privacy](https://www.smtp2go.com/privacy/)
* ZeptoMail, api.zeptomail.com - [Terms](https://www.zoho.com/terms.html), [Privacy](https://www.zoho.com/privacy.html)
* SocketLabs, inject.socketlabs.com - [Terms](https://www.socketlabs.com/terms-of-use/), [Privacy](https://www.socketlabs.com/privacy-policy/)
* SendPulse, api.sendpulse.com - [Terms](https://sendpulse.com/en/legal/terms), [Privacy](https://sendpulse.com/en/legal/pp)
* Bird, api.bird.com - [Legal hub](https://bird.com/en/legal/)
* Mailercloud, email-api.mailercloud.com - [Terms](https://www.mailercloud.com/terms-and-conditions), [Privacy](https://www.mailercloud.com/privacy-policy)
* Sweego, api.sweego.io - [Terms of sale](https://www.sweego.io/general-terms-and-conditions-of-sale) (link unreachable for automated verification, and no privacy policy page found at time of writing - verify both directly with Sweego)
* Emailit, api.emailit.com - [Terms](https://emailit.com/terms-of-service/) (privacy policy not found at time of writing - verify directly with Emailit)

SMTP connections (including the Gmail, Microsoft, Zoho, Amazon and other presets): your own SMTP server, or the preset's documented host, at the address you enter or that the preset fills in. Amazon SES and Amazon WorkMail specifically: [AWS service terms](https://aws.amazon.com/service-terms/), [AWS privacy notice](https://aws.amazon.com/privacy/).

SMS connections: the SMS message (recipient number and text) and your credentials go to whichever gateway the connection uses.

* Twilio, api.twilio.com - [Terms](https://www.twilio.com/en-us/legal/tos), [Privacy](https://www.twilio.com/en-us/legal/privacy)
* Vonage, rest.nexmo.com - [Legal hub](https://www.vonage.com/legal/) (site blocks automated verification of the terms/privacy sub-pages - check directly)
* Plivo, api.plivo.com - [Terms](https://www.plivo.com/legal/tos/), [Privacy](https://www.plivo.com/legal/privacy/)
* Clickatell, platform.clickatell.com - [Legal hub](https://www.clickatell.com/legal/)

The Diagnostics screen looks up the public DNS TXT records (SPF and DMARC) of your sender domain through your server's DNS resolver. No data about your site is sent.

## Source code ##

VuloMail's admin interface is built with React/TypeScript and compiled with webpack into `assets/js/index.js` and `assets/js/vendors.js`. The human-readable, editable source for these bundles - along with the rest of the plugin - is publicly available at:

https://github.com/vulolabs/vulolabs/tree/main/plugins/vulomail

Build instructions: `pnpm install` then `pnpm build` from the repository root (Node.js + pnpm required). See `DEVELOPER-DOC.md` in that repository for full environment setup.

## Installation ##

1. Install and activate VuloMail.
2. Open Settings → Connections and add an email connection.
3. Set the connection as primary.
4. Configure a sender email address verified with your provider.
5. Send a test email from Tools.

You can then add a backup email connection, connect an SMS provider and enable the alerts you need.

Requires WordPress 6.4 or later and PHP 7.4 or later.

## Frequently Asked Questions ##

### What does VuloMail do? ###

VuloMail sends WordPress emails through your chosen SMTP or email API connection, records sending results and supports SMS notifications for website and WooCommerce activity.

### Can VuloMail help when WordPress is not sending emails? ###

Yes. Connect an email provider, set it as primary and send a test email. The diagnostics and logs help identify configuration problems and provider-reported errors.

### Which email providers are supported? ###

VuloMail has native API connections for SendGrid, Mailgun, Brevo, Postmark, Elastic Email, Mailjet, MailerSend, Maileroo, Mailtrap, Mandrill, Netcore, Resend, SendLayer, SparkPost, SMTP2GO, ZeptoMail, SocketLabs, SendPulse, Bird, Mailercloud, Sweego and Emailit, plus one-click SMTP presets for Gmail, Google Workspace, Outlook.com, Microsoft 365, Zoho Mail, Yahoo Mail, iCloud Mail, AOL Mail, Yandex Mail, Fastmail, Titan Email, Purelymail, Migadu, Namecheap Private Email, Rackspace Email, Amazon SES, Amazon WorkMail and Cloudflare Email Sending. Any other service can be connected through generic SMTP where its authentication requirements allow it.

### Does VuloMail work with WooCommerce and contact forms? ###

Yes. It handles emails sent through the standard WordPress wp_mail() function, including WooCommerce order emails and contact form notifications. Plugins that send directly through another service are not affected.

### What happens if my primary email connection fails? ###

VuloMail tries your configured backup connection. If enabled, the WordPress default mailer acts as a final fallback. Sending attempts appear together in one log entry.

### Does Sent mean the email reached the inbox? ###

No. Sent means the provider accepted the message. It does not confirm delivery to an inbox or phone.

### Which SMS providers can I connect? ###

Twilio, Vonage, Plivo and Clickatell. You need your own provider account, and provider charges apply.

### Can I send WooCommerce order notifications by SMS? ###

Yes. Enable supported customer order alerts and customize their messages. WooCommerce is required for store and customer alerts. All SMS alerts are off by default.

### Can I resend a logged message? ###

Yes, if its content was stored and its recipients were not masked. Resending uses your current routing settings.

### Where are logs stored? ###

Logs are stored in your own WordPress database. Message content storage is off by default. You can enable recipient masking and choose a retention period.

### Do I need a VuloLabs account? ###

No. VuloMail does not require a VuloLabs account or subscription. Connect your own email or SMS provider to send messages.

### Does activation change my email routing immediately? ###

No. Add an email connection and set it as primary to route WordPress emails through that connection.

### Will uninstalling delete my data? ###

Data is kept by default. You can choose Delete everything before deleting the plugin to remove its connections, settings and logs. Deactivation does not delete data.

## Screenshots ##

1. Dashbaord.
2. SMS Alert.
3. Mail Logs.
4. Tools.
5. Connenction Settings.
6. Email Settings.
7. SMS Settings.
8. Logging and Privacy Settings.

## Changelog ##

### 1.0.0 ###
* First release.
* Send WordPress email through SMTP or a provider API, with one-click presets for popular mailboxes.
* Backup email connection with automatic failover.
* SMS through Twilio, Vonage, Plivo or Clickatell.
* SMS alerts for site and WooCommerce order events.
* Email and SMS logs with search, failure reasons and resend.
* Test email, test SMS and diagnostics.
* Privacy controls: masked recipients, optional message storage, log retention.
