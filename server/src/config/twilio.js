const twilio = require('twilio');

let client;

function getTwilioClient() {
  if (!client) {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set in .env');
    }
    client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  }
  return client;
}

/**
 * Send an SMS via Twilio.
 * @param {string} to   - E.164 recipient phone number
 * @param {string} body - SMS text
 */
async function sendSMS(to, body) {
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) throw new Error('TWILIO_PHONE_NUMBER must be set in .env');
  return getTwilioClient().messages.create({ to, from, body });
}

module.exports = { sendSMS };
