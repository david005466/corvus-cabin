const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const ical = require('ical');
const fetch = require('node-fetch');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const ICAL_URL = process.env.ICAL_URL || 'https://www.airbnb.com/calendar/ical/1797905.ics?t=0aded3422302403ab09d7003590a8f15&locale=en-GB';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'corvuscabinportsea@gmail.com';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple in-memory / file-based booking store (replace with DB for production)
const BOOKINGS_FILE = path.join(__dirname, 'bookings.json');
function loadBookings() {
  try {
    return JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf8'));
  } catch {
    return [];
  }
}
function saveBookings(bookings) {
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
}

// Fetch and parse iCal for blocked dates
async function getBlockedDates() {
  try {
    const res = await fetch(ICAL_URL);
    const text = await res.text();
    const data = ical.parseICS(text);
    const blocked = [];
    for (const key in data) {
      if (data[key].type === 'VEVENT') {
        const start = data[key].start;
        const end = data[key].end;
        if (start && end) {
          blocked.push({
            start: start.toISOString().split('T')[0],
            end: end.toISOString().split('T')[0],
            summary: data[key].summary || 'Blocked'
          });
        }
      }
    }
    return blocked;
  } catch (err) {
    console.error('iCal fetch error:', err);
    return [];
  }
}

// Check if dates overlap with blocked
function datesOverlap(checkIn, checkOut, blocked) {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  return blocked.some(b => {
    const bStart = new Date(b.start);
    const bEnd = new Date(b.end);
    return start < bEnd && end > bStart;
  });
}

app.get('/api/availability', async (req, res) => {
  const blocked = await getBlockedDates();
  res.json({ blocked });
});

app.post('/api/check-availability', async (req, res) => {
  const { checkIn, checkOut } = req.body;
  if (!checkIn || !checkOut) return res.status(400).json({ error: 'Dates required' });
  const blocked = await getBlockedDates();
  const available = !datesOverlap(checkIn, checkOut, blocked);
  res.json({ available, blocked });
});

app.post('/api/create-booking-request', async (req, res) => {
  const { name, email, phone, checkIn, checkOut, guests, message, petDetails } = req.body;
  if (!name || !email || !checkIn || !checkOut) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const blocked = await getBlockedDates();
  if (datesOverlap(checkIn, checkOut, blocked)) {
    return res.status(400).json({ error: 'Dates not available' });
  }

  const bookings = loadBookings();
  const booking = {
    id: Date.now().toString(),
    name,
    email,
    phone: phone || '',
    checkIn,
    checkOut,
    guests: guests || 1,
    message: message || '',
    petDetails: petDetails || '',
    status: 'pending', // pending / accepted / rejected / paid
    createdAt: new Date().toISOString()
  };
  bookings.push(booking);
  saveBookings(bookings);

  // Send email notification to owner
  sendBookingEmail(booking);

  res.json({ success: true, bookingId: booking.id, message: 'Request submitted. Owner will review and contact you.' });
});

// Stripe: create checkout session (call after owner accepts, or for deposit)
app.post('/api/create-checkout-session', async (req, res) => {
  const { bookingId, amount } = req.body; // amount in cents
  if (!bookingId || !amount) return res.status(400).json({ error: 'Missing data' });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'aud',
          product_data: { name: 'Corvus Cabin Portsea – Booking' },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${req.headers.origin || 'https://your-app.onrender.com'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'https://your-app.onrender.com'}/`,
      metadata: { bookingId }
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Stripe error' });
  }
});

// Owner endpoints (protect these in production with auth)
app.get('/api/bookings', (req, res) => {
  res.json(loadBookings());
});

app.post('/api/bookings/:id/accept', (req, res) => {
  const bookings = loadBookings();
  const b = bookings.find(x => x.id === req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  b.status = 'accepted';
  saveBookings(bookings);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
