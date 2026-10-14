const https = require("node:https");

/**
 * Sends notification email when a customer submits a valid top-up request
 * @param {Object} notif Top-up notification details
 */
async function sendTopUpNotification(notif) {
  const recipient = process.env.NOTIFICATION_EMAIL || "vendor-orders@example.com";
  const resendApiKey = process.env.RESEND_API_KEY;

  const subject = `New SIM Top-Up Request - ${notif.amazonOrderId} (${notif.networkName} ${notif.topUpValue})`;

  const textBody = `
New SIM Top-Up Request Received!

Amazon Order ID: ${notif.amazonOrderId}
SIM ICCID:       ${notif.simIccid}
Network Name:    ${notif.networkName}
Top-Up Value:    ${notif.topUpValue}
ICCID Verified:  Yes
Customer Email:  ${notif.customerEmail || "Not provided"}
Submitted At:    ${notif.submittedAt}

View all requests in your admin dashboard.
  `.trim();

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; border: 1px solid #e1e8ed; border-radius: 8px; overflow: hidden;">
      <div style="background: #0d4f8b; color: #ffffff; padding: 20px; text-align: center;">
        <h2 style="margin: 0;">New SIM Top-Up Request</h2>
        <p style="margin: 4px 0 0; font-size: 14px; opacity: 0.9;">Verified Amazon SIM Order</p>
      </div>
      <div style="padding: 24px; background: #ffffff;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr style="border-bottom: 1px solid #f0f4f8;">
            <td style="padding: 10px 0; color: #627083; font-weight: bold;">Amazon Order ID:</td>
            <td style="padding: 10px 0; font-weight: bold; font-family: monospace;">${notif.amazonOrderId}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f0f4f8;">
            <td style="padding: 10px 0; color: #627083; font-weight: bold;">SIM ICCID:</td>
            <td style="padding: 10px 0; font-weight: bold; font-family: monospace;">${notif.simIccid}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f0f4f8;">
            <td style="padding: 10px 0; color: #627083; font-weight: bold;">Network Name:</td>
            <td style="padding: 10px 0; font-weight: bold;">${notif.networkName}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f0f4f8;">
            <td style="padding: 10px 0; color: #627083; font-weight: bold;">Top-Up Value:</td>
            <td style="padding: 10px 0; font-weight: bold; color: #146b37; font-size: 16px;">${notif.topUpValue}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f0f4f8;">
            <td style="padding: 10px 0; color: #627083; font-weight: bold;">ICCID Status:</td>
            <td style="padding: 10px 0;"><span style="background: #e9f8ef; color: #146b37; padding: 4px 10px; border-radius: 999px; font-weight: bold; font-size: 12px;">ICCID Verified ✓</span></td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #627083; font-weight: bold;">Customer Email:</td>
            <td style="padding: 10px 0;">${notif.customerEmail || "-"}</td>
          </tr>
        </table>
      </div>
    </div>
  `;

  // 1. If RESEND_API_KEY is provided: send via Resend HTTPS API (built-in, no npm packages needed)
  if (resendApiKey) {
    try {
      await sendViaResend({
        apiKey: resendApiKey,
        from: process.env.FROM_EMAIL || "SIM Top-Up <notifications@resend.dev>",
        to: recipient,
        subject,
        text: textBody,
        html: htmlBody
      });
      console.log(`[Email] Notification sent via Resend to ${recipient}`);
      return true;
    } catch (err) {
      console.error("[Email Error] Failed to send email via Resend:", err.message);
    }
  }

  // Fallback: log notification for audit
  console.log(`[Email Ready] Notification logged for order ${notif.amazonOrderId} to ${recipient}.`);
  return false;
}

function sendViaResend({ apiKey, from, to, subject, text, html }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ from, to: [to], subject, text, html });
    const req = https.request(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(body || "{}"));
          } else {
            reject(new Error(`Resend API returned status ${res.statusCode}: ${body}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

module.exports = { sendTopUpNotification };
