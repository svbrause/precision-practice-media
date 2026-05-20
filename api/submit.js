import { Storage } from '@google-cloud/storage';
import { Resend } from 'resend';
import { randomUUID } from 'crypto';

const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'sugam@ponce.ai';
const NOTIFY_CC_EMAIL = process.env.NOTIFY_CC_EMAIL || 'notifs@ponce.ai';
const GCS_BUCKET = process.env.GCS_BUCKET || 'test-deploy-august25';
const GCS_PREFIX = process.env.GCS_PREFIX || 'precision-practice-media/submissions';

function getStorage() {
  const json = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!json) {
    throw new Error('GCP_SERVICE_ACCOUNT_JSON is not configured');
  }
  const credentials = JSON.parse(json);
  return new Storage({
    projectId: credentials.project_id,
    credentials,
  });
}

function validateBody(body) {
  const required = ['practiceName', 'contactName', 'email', 'location'];
  for (const field of required) {
    const value = body[field];
    if (!value || typeof value !== 'string' || !value.trim()) {
      return `Missing required field: ${field}`;
    }
  }
  const email = body.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Invalid email address';
  }
  return null;
}

function buildSubmission(body) {
  return {
    id: randomUUID(),
    submittedAt: new Date().toISOString(),
    practiceName: body.practiceName.trim(),
    contactName: body.contactName.trim(),
    email: body.email.trim(),
    phone: (body.phone || '').trim() || null,
    location: body.location.trim(),
    procedures: Array.isArray(body.procedures) ? body.procedures : [],
    referral: (body.referral || '').trim() || null,
    source: 'precision-practice-media',
  };
}

function formatEmailHtml(submission) {
  const procedures =
    submission.procedures.length > 0
      ? submission.procedures.map((p) => `<li>${escapeHtml(p)}</li>`).join('')
      : '<li><em>None selected</em></li>';

  return `
    <h2>New Precision Practice Media application</h2>
    <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
      <tr><td><strong>Practice</strong></td><td>${escapeHtml(submission.practiceName)}</td></tr>
      <tr><td><strong>Contact</strong></td><td>${escapeHtml(submission.contactName)}</td></tr>
      <tr><td><strong>Email</strong></td><td><a href="mailto:${escapeHtml(submission.email)}">${escapeHtml(submission.email)}</a></td></tr>
      <tr><td><strong>Phone</strong></td><td>${escapeHtml(submission.phone || '—')}</td></tr>
      <tr><td><strong>Location</strong></td><td>${escapeHtml(submission.location)}</td></tr>
      <tr><td><strong>Referral</strong></td><td>${escapeHtml(submission.referral || '—')}</td></tr>
    </table>
    <p><strong>Procedures:</strong></p>
    <ul>${procedures}</ul>
    <p style="color:#666;font-size:12px;">Submission ID: ${escapeHtml(submission.id)} · ${escapeHtml(submission.submittedAt)}</p>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function saveToGcs(submission) {
  const storage = getStorage();
  const bucket = storage.bucket(GCS_BUCKET);
  const objectName = `${GCS_PREFIX}/${submission.submittedAt.slice(0, 10)}/${submission.id}.json`;
  const file = bucket.file(objectName);
  await file.save(JSON.stringify(submission, null, 2), {
    contentType: 'application/json',
    metadata: {
      metadata: {
        submissionId: submission.id,
        practiceName: submission.practiceName,
      },
    },
  });
  return objectName;
}

async function sendNotificationEmail(submission) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error('EMAIL_FROM is not configured');
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: NOTIFY_EMAIL,
    cc: NOTIFY_CC_EMAIL,
    replyTo: submission.email,
    subject: `New application: ${submission.practiceName}`,
    html: formatEmailHtml(submission),
  });

  if (error) {
    throw new Error(error.message || 'Failed to send email');
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const validationError = validateBody(req.body || {});
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const submission = buildSubmission(req.body);

  try {
    const gcsPath = await saveToGcs(submission);
    await sendNotificationEmail(submission);
    return res.status(200).json({ ok: true, id: submission.id, gcsPath });
  } catch (err) {
    console.error('Submit failed:', err);
    return res.status(500).json({
      error: 'Submission failed. Please try again or email us directly.',
    });
  }
}
