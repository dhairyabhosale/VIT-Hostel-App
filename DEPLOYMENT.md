# VIT Hostel Connect — independent deployment

This project no longer requires Emergent for email or object storage.

## 1. MongoDB Atlas

Create a free MongoDB Atlas cluster and a database named `vit_hostel_connect`.
Create a database user and allow the deployment service to connect. Copy the MongoDB connection string into `MONGO_URL`.

## 2. Brevo email

Create a Brevo account, verify the sender address/domain, and create a transactional API key.
Set:

- `BREVO_API_KEY`
- `EMAIL_FROM_ADDRESS`
- `EMAIL_FROM_NAME=VIT Hostel Connect`
- optional `EMAIL_REPLY_TO`

The student activation flow already generates a six-digit OTP, stores a hash and a ten-minute expiry, and sends the OTP through `emailer.py`.

## 3. Cloudinary

Create a Cloudinary account and copy the cloud name, API key, and API secret into:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Complaint photos are uploaded through the existing `/api/uploads/complaint-photo` endpoint and stored as Cloudinary images. The API keeps the file metadata in MongoDB.

## 4. Render

The root `render.yaml` is ready for a Python web service. Deploy the repository as a Blueprint or create a Python web service with:

- Root directory: `backend`
- Build: `pip install -r requirements.txt`
- Start: `uvicorn server:app --host 0.0.0.0 --port $PORT`
- Health check: `/api/`

Set the environment variables listed in `render.yaml`. Generate a long random `JWT_SECRET` and keep all secrets in Render's environment settings; never commit them.

After deployment, verify:

`https://<render-service>.onrender.com/api/`

It should return:

`{"message":"VIT Hostel Connect API"}`

## 5. Expo / Android

Set `EXPO_PUBLIC_BACKEND_URL` to the Render HTTPS URL, without a trailing slash. For local development, create `frontend/.env.local`:

```text
EXPO_PUBLIC_BACKEND_URL=https://<render-service>.onrender.com
```

For an EAS build, configure the same variable in the EAS environment used by the build profile. Do not put database, email, Cloudinary, or JWT secrets in the Expo app; only the public backend URL belongs in the mobile client.

Then build the Android app from `frontend` with the existing EAS configuration.

## Demo data

Run the existing backend seed script only against your demo database. Never seed demo passwords into a production database without changing them.

## Security notes

- Never commit `.env`, API keys, JWT secrets, or MongoDB credentials.
- Use HTTPS for the deployed API.
- Keep MongoDB access restricted to the deployment service where practical.
- Use a verified sender in Brevo.
- Rotate secrets if they are ever exposed.
