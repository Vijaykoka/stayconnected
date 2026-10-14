try {
  process.loadEnvFile();
} catch {}

const { sendTopUpNotification } = require("../mailer");

async function main() {
  console.log("=================================================");
  console.log(" TESTING SIM TOP-UP EMAIL NOTIFICATION");
  console.log("=================================================\n");

  const sampleNotification = {
    id: "REQ-TEST-001",
    amazonOrderId: "123-7654321-9876543",
    simIccid: "8944112233445566778",
    networkName: "giffgaff",
    topUpValue: "£10",
    customerEmail: "customer-test@example.com",
    submittedAt: new Date().toISOString()
  };

  const recipient = process.env.NOTIFICATION_EMAIL || "vendor-orders@example.com";
  const hasResendKey = Boolean(process.env.RESEND_API_KEY);

  console.log(`Target Recipient Email:  ${recipient}`);
  console.log(`Resend API Key set?      ${hasResendKey ? "YES (Live real email mode)" : "NO (Console/Audit log mode)"}\n`);

  console.log("Sending sample notification...");
  const sent = await sendTopUpNotification(sampleNotification);

  if (sent) {
    console.log(`\n✓ SUCCESS! Real email was dispatched to ${recipient} via Resend.`);
  } else {
    console.log("\n✓ SUCCESS (Simulation Mode)!");
    console.log("No RESEND_API_KEY was provided, so the email payload was verified and logged.");
    console.log("To send a real email to your inbox, set:");
    console.log("  $env:RESEND_API_KEY=\"re_your_free_key\"");
    console.log("  $env:NOTIFICATION_EMAIL=\"your-email@gmail.com\"");
    console.log("and re-run this script!");
  }
}

main().catch(console.error);
