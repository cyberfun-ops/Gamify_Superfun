const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

async function request(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
}

/**
 * Send OTP to the given phone number.
 * @param {string} phone - E.164 format, e.g. "+911234567890"
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function sendOTP(phone) {
  return request('/auth/send-otp', { phone });
}

/**
 * Verify OTP and complete sign-in / sign-up.
 * @param {string} phone - E.164 format
 * @param {string} otp   - 6-digit OTP string
 * @param {string} [name] - Required for sign-up, omit for sign-in
 * @returns {Promise<{ token: string, user: { id: string, name: string, phone: string } }>}
 */
export async function verifyOTP(phone, otp, name) {
  const body = { phone, otp };
  if (name) body.name = name;
  return request('/auth/verify-otp', body);
}
