# Corvus Cabin Portsea – Booking Site

Simple full-stack booking site for Corvus Cabin Portsea.

## Features
- Live availability check from Airbnb iCal feed
- Booking request form (subject to owner acceptance)
- Stripe Checkout integration (ready for your keys)
- Clean responsive frontend

## Local setup
1. Copy `.env.example` to `.env` and add your Stripe secret key.
2. `npm install`
3. `npm start`
4. Open http://localhost:3000

## Deploy to Render
1. Push this folder to a GitHub repository.
2. Go to https://render.com → New → Web Service
3. Connect the GitHub repo.
4. Settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment variables:
     - `STRIPE_SECRET_KEY` = your Stripe secret key (starts with sk_live_ or sk_test_)
     - `ICAL_URL` = the iCal link
     - `OWNER_EMAIL` = corvuscabinportsea@gmail.com
5. Deploy.

## Owner workflow
- View pending bookings at `/api/bookings`
- Accept a booking: POST `/api/bookings/:id/accept`
- After acceptance, create a Stripe Checkout session for the guest to pay.

## Notes
- Bookings are stored in `bookings.json` (simple file storage). For production use a real database.
- Protect owner endpoints with authentication before going live.
- Add email notifications (e.g. Nodemailer) for new requests.
