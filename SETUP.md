# Form submission setup (Vercel + GCS + email)

Submissions are saved as JSON in Google Cloud Storage and an email is sent to **sugam@ponce.ai** (CC: **notifs@ponce.ai**) via [Resend](https://resend.com).

## 1. Google Cloud Storage

### Service account

1. In [Google Cloud Console](https://console.cloud.google.com/), open the project that owns bucket `test-deploy-august25`.
2. **IAM & Admin → Service Accounts → Create service account** (e.g. `vercel-ppm-submit`).
3. Grant no project-wide roles yet; use bucket-level access below.
4. **Keys → Add key → JSON** and download the key file.

### Bucket permissions

On bucket `test-deploy-august25`:

- **Permissions → Grant access**
- Principal: the service account email
- Role: **Storage Object Creator** (writes JSON files)

Submissions are stored at:

`gs://test-deploy-august25/precision-practice-media/submissions/YYYY-MM-DD/<uuid>.json`

### Vercel env var

In the Vercel project → **Settings → Environment Variables**, add:

| Name | Value |
|------|--------|
| `GCP_SERVICE_ACCOUNT_JSON` | Entire contents of the JSON key file (one line) |
| `GCS_BUCKET` | `test-deploy-august25` |
| `GCS_PREFIX` | `precision-practice-media/submissions` (optional; this is the default) |

## 2. Email (Resend)

Vercel serverless functions cannot send mail without a provider. This project uses Resend.

1. Create an account at [resend.com](https://resend.com).
2. **Domains** → add and verify a sending domain (e.g. `ponce.ai` or a subdomain).
3. Create an API key.

Vercel environment variables:

| Name | Value |
|------|--------|
| `RESEND_API_KEY` | Your Resend API key |
| `EMAIL_FROM` | Verified sender, e.g. `Precision Practice Media <notifications@ponce.ai>` |
| `NOTIFY_EMAIL` | `sugam@ponce.ai` (optional; this is the default) |
| `NOTIFY_CC_EMAIL` | `notifs@ponce.ai` (optional; this is the default) |

## 3. Deploy

Push to GitHub. Vercel will install dependencies from `package.json` and deploy `/api/submit`.

Test locally (optional):

```bash
npm install
npx vercel dev
```

Copy `.env.example` to `.env` and fill in real values, then open the local URL and submit the form.

## 4. Verify

1. Submit the form on the live site.
2. Check **sugam@ponce.ai** and **notifs@ponce.ai** for the notification email.
3. In GCS, list objects under `precision-practice-media/submissions/`.
