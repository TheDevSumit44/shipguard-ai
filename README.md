<div align="center">

# 🚢 ShipGuard AI

**Real-time Shipment Risk Monitoring & Logistics Intelligence Platform**

![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black&style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white&style=for-the-badge)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?logo=firebase&logoColor=black&style=for-the-badge)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white&style=for-the-badge)
![Tailwind](https://img.shields.io/badge/Tailwind-38B2AC?logo=tailwind-css&logoColor=white&style=for-the-badge)
![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white&style=for-the-badge)

*Real-time Tracking • Risk Assessment • Intelligent Alerts • Admin Controls • Role-Based Access*

[Live Demo](https://shipguard-ai-nine.vercel.app) • [Features](#-features) • [Quick Start](#-quick-start) • [Security](#-security)

</div>

---

## 📖 About

**ShipGuard AI** is an enterprise-grade logistics monitoring platform that provides real-time visibility into shipment operations, automated risk assessment, and predictive analytics. Built for modern supply chains, it seamlessly integrates with Transportation Management Systems (TMS), Enterprise Resource Planning (ERP) systems, and carrier APIs.

The platform leverages **Firebase Firestore** for real-time data synchronization, enabling instant updates across dashboards, alerts, and analytics. With intelligent webhook ingestion, weather integration, and logistics news aggregation, ShipGuard AI delivers actionable insights that help businesses proactively manage shipment risks and optimize operations.

Whether you're tracking a single shipment or managing thousands across multiple carriers and modes, ShipGuard AI provides the tools you need for complete logistics visibility and control.

---

## ✨ Features

### Core Features
- ✅ **Real-time Shipment Tracking** — Monitor shipments across multiple carriers and transport modes
- ✅ **Automated Risk Scoring** — Dynamic risk calculation with visual distribution analytics
- ✅ **Intelligent Alert System** — Proactive notifications for high-risk events and delays
- ✅ **Live Analytics Dashboard** — Trend analysis, operational metrics, and KPIs
- ✅ **Webhook Integration** — Seamless ingestion from TMS/ERP systems with secure authentication
- ✅ **Weather Monitoring** — Location-based weather forecasts for route planning
- ✅ **Logistics News Feed** — Real-time industry news aggregation
- ✅ **Route Intelligence** — Alternative route recommendations with operational risk context

### Authentication & Authorization
- ✅ **Firebase Authentication** — Email/password and Google OAuth sign-in
- ✅ **Whitelist-based Admin Access** — Only authorized emails can access admin features
- ✅ **Role-Based Access Control** — Two-tier system: **Admin** and **Viewer**
- ✅ **Session Management** — Firestore-backed user profiles with persistent settings
- ✅ **Secure OAuth** — Google OAuth whitelist validation prevents unauthorized admin access

### Admin Features
- ✅ **Admin Controls Dashboard** — System overview with user management
- ✅ **Data Management** — View all users, their roles, tracking assignments, and activity
- ✅ **Shipment Management** — Delete shipments from the system
- ✅ **Alert Management** — Acknowledge, resolve, and delete alerts
- ✅ **User Activity Tracking** — Monitor user activity with last-active timestamps

### Viewer Features
- ✅ **Read-Only Dashboard** — View shipments, alerts, and analytics
- ✅ **Search & Filter** — Search shipments by ID, origin, destination, carrier, product, customer
- ✅ **Alert Monitoring** — View and monitor alerts with filtering by severity and status
- ✅ **Analytics Access** — Full access to analytics and insights (read-only)
- ✅ **No Action Rights** — Cannot acknowledge, resolve, delete, or modify data

### Data & Persistence
- ✅ **Firestore Real-time Sync** — Instant updates across all connected clients
- ✅ **Firestore User Profiles** — All user data stored securely in Firestore (not localStorage)
- ✅ **Multi-carrier Support** — DHL, FedEx, UPS, and custom carrier integration
- ✅ **Custom Reporting** — Configurable views, filters, and analytics

### Security
- ✅ **Webhook Security** — HMAC signature verification and rate limiting
- ✅ **Environment Variables** — All secrets managed via `.env` (never committed)
- ✅ **Secure API Routes** — Weather, news, and route proxy endpoints with backend-only provider keys
- ✅ **Firestore Rules** — Document-level access control with custom security rules
- ✅ **Admin Whitelist** — Email-based access control for administrative functions

---

## 🛠️ Tech Stack

### Frontend
- **React 18** — Modern component-based UI framework
- **Vite** — Lightning-fast build tool and dev server
- **Tailwind CSS** — Utility-first styling with custom design system
- **Recharts** — Interactive data visualization and charting
- **Firebase Web SDK** — Client-side Firestore subscriptions and authentication
- **Framer Motion** — Smooth animations and transitions

### Backend
- **Node.js** — JavaScript runtime for server-side logic
- **Express** — Minimal and flexible web application framework
- **Firebase Admin SDK** — Server-side Firestore operations and authentication
- **CORS + Helmet + Morgan** — Cross-origin controls, security headers, and request logging
- **Joi + express-rate-limit** — Payload validation and abuse protection

### Database & Authentication
- **Cloud Firestore** — Scalable NoSQL document database with real-time sync
- **Firebase Authentication** — Secure user authentication (Email/Password + Google OAuth)
- **Firebase Admin SDK** — Server-side credential handling and user management

### External Integrations
- **OpenWeather API** — Weather data and location-based forecasts
- **News API** — Logistics and supply chain news aggregation

### Deployment
- **Vercel** — Frontend deployment (React/Vite)
- **Render** — Backend deployment (Express.js)

---

## 📁 Project Structure

```
shipguard-ai/
├── backend/
│   ├── server.js                 # Express server, API routes, webhook handler
│   ├── .env                      # Backend environment variables (gitignored)
│   ├── .env.example              # Backend env template
│   ├── package.json              # Backend dependencies
│   └── node_modules/
├── src/
│   ├── components/               # Reusable React components
│   ├── contexts/
│   │   └── AuthContext.jsx       # Firebase auth management & role validation
│   ├── pages/
│   │   ├── Dashboard.jsx         # Command Center with Admin Controls
│   │   ├── Alerts.jsx            # Alerts management (role-based actions)
│   │   ├── Shipments.jsx         # Shipments tracking (role-based actions)
│   │   ├── Settings.jsx          # User settings (Admin/Viewer roles)
│   │   ├── Login.jsx             # Email/Password + Google OAuth
│   │   ├── Register.jsx          # User registration
│   │   └── Analytics.jsx         # Analytics & insights
│   ├── services/
│   │   └── firestoreService.js   # Firestore operations & data management
│   ├── lib/
│   │   ├── api/                  # Backend proxy API clients
│   │   └── ml/                   # Risk prediction utilities
│   ├── config/
│   │   └── firebase.js           # Firebase SDK initialization
│   ├── App.jsx                   # Main application component & routing
│   └── main.jsx                  # React entry point
├── public/                       # Static assets
├── .env                          # Frontend env vars (gitignored)
├── .env.example                  # Frontend env template
├── .gitignore                    # Git exclusion rules
├── package.json                  # Frontend dependencies
├── vite.config.js                # Vite configuration
├── tailwind.config.js            # Tailwind customization
├── postcss.config.js             # PostCSS setup
└── README.md                     # This file
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Firebase Project** with Firestore and Authentication enabled
- **Google OAuth** configured in Firebase Console
- **Git** for version control

### Installation

1. **Clone the repository:**
```bash
git clone https://github.com/TheDevSumit44/shipguard-ai.git
cd shipguard-ai
```

2. **Install frontend dependencies:**
```bash
npm install
```

3. **Install backend dependencies:**
```bash
cd backend
npm install
cd ..
```

### Configuration

#### Frontend (.env)

Create `.env` file in the project root:

```env
# Firebase Web Configuration
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Backend URL (optional for local dev)
VITE_BACKEND_URL=http://localhost:8787
```

#### Backend (.env)

Create `backend/.env` file:

```env
# Server Configuration
PORT=8787
NODE_ENV=development

# Firebase Admin SDK Credentials
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your-service-account@your_project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n

# Webhook Security
WEBHOOK_SECRET=your_secure_webhook_secret_32_chars_minimum

# PII Encryption (optional)
PII_ENCRYPTION_KEY=your_encryption_key_32_chars_minimum

# CORS Settings
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,https://your-domain.com

# External APIs (optional)
OPENWEATHER_API_KEY=your_openweather_key
NEWS_API_KEY=your_news_api_key
GOOGLE_MAPS_API_KEY=your_google_maps_key
```

**To get Firebase credentials:**
1. Go to Firebase Console → Your Project
2. Click ⚙️ **Project Settings** → **Service Accounts** tab
3. Click **Generate New Private Key**
4. Copy the JSON values to your `.env`

**For Google OAuth:**
1. Firebase Console → **Authentication** → **Sign-in method**
2. Enable **Google** provider
3. Add your domain to **Authorized domains**

### Admin Email Configuration

Edit `src/contexts/AuthContext.jsx` line 28:

```javascript
const ADMIN_EMAIL_WHITELIST = ['your-admin-email@gmail.com'];
```

Only emails in this list can access admin features. All other users get **Viewer** role automatically.

### Run the Application

**Development mode:**

Terminal 1 - Frontend:
```bash
npm run dev
```

Terminal 2 - Backend:
```bash
cd backend
npm run dev
```

The app will be available at `http://localhost:5173`

**Build for production:**

```bash
npm run build
cd backend && npm run build
```

---

## 👥 Role-Based Access Control

### Admin Role
- **Who:** Only authorized emails in whitelist
- **Access:** All features + admin controls
- **Permissions:**
  - ✅ View shipments, alerts, analytics
  - ✅ Acknowledge and resolve alerts
  - ✅ Delete alerts and shipments
  - ✅ View all system users and activity
  - ✅ Manage user data
  - ✅ Access admin dashboard with controls

### Viewer Role
- **Who:** All other authenticated users
- **Access:** Read-only dashboard
- **Permissions:**
  - ✅ View shipments, alerts, analytics
  - ✅ Search and filter data
  - ✅ View their own profile
  - ❌ Cannot acknowledge, resolve, or delete
  - ❌ Cannot modify any data
  - ❌ Cannot access admin controls

---

## 📚 Authentication & Authorization

### Firebase Authentication Methods

#### Email/Password Sign-In
1. User enters email and password
2. AuthContext validates email against admin whitelist if "Admin" role selected
3. Email/password auth allowed only for admin whitelist emails if claiming admin role
4. Non-whitelisted emails automatically assigned **Viewer** role

#### Google OAuth Sign-In
1. User selects role (Admin or Viewer)
2. Google popup opens
3. After authentication, email is checked against whitelist
4. **Critical Security:** Whitelist validated AFTER authentication
   - Admin email (whitelisted) → Assigned **Admin** role
   - Any other email → Assigned **Viewer** role
5. Error shown if non-authorized email attempts admin access

### Security Features
- ✅ **Whitelist Validation** — Enforced at authentication time
- ✅ **Role Persistence** — Roles stored in Firestore, not localStorage
- ✅ **Unauthorized Downgrade** — Non-authorized admins automatically downgraded to viewer
- ✅ **Session Protection** — Firebase session timeout with auto-logout
- ✅ **No Bypass Possible** — OAuth cannot override whitelist restrictions

---

## 📊 Dashboard Features

### Admin Dashboard (Command Center + Admin Controls)
Shows the standard dashboard plus:
- **Admin Controls Section:**
  - Total Users count
  - Total Alerts count  
  - Total Shipments count
  - Data Management button
- **Data Management Modal:**
  - Table of all system users
  - Columns: Name, Email, Role, Tracking (shipment count), Last Active
  - Color-coded role badges (Purple for Admin, Blue for Viewer)

### Viewer Dashboard (Read-Only)
Shows monitoring information:
- **Command Center:** Shipment stats, risk distribution, trends (no action buttons)
- **Shipments Section:** View and search shipments (no delete option)
- **Alerts Section:** View alerts (no acknowledge/resolve buttons)
- **Analytics:** Full access to charts and insights

---

## 🔒 Security

### Authentication Security
- ✅ **Firebase Auth** — Industry-standard authentication
- ✅ **Email Whitelist** — Admin access restricted to authorized emails
- ✅ **OAuth Validation** — Email verified after Google authentication
- ✅ **No Stored Secrets** — Firebase credentials in `.env` (never committed)
- ✅ **HTTPS Only** — All communications encrypted in transit

### Data Security
- ✅ **Firestore Rules** — Document-level access control
- ✅ **User Isolation** — Users can only access their own profiles
- ✅ **Role Enforcement** — Viewer users cannot modify data
- ✅ **Webhook Validation** — HMAC signature verification for incoming webhooks

### Code Security
- ✅ **No Hardcoded Secrets** — All credentials in environment variables
- ✅ **Git Ignore** — `.env` and credential files excluded from version control
- ✅ **Dependency Auditing** — Regular npm security checks
- ✅ **CORS Protection** — Configured origin whitelist

### Best Practices
1. **Never commit** `.env` files or `service-account.json`
2. **Rotate secrets** regularly (API keys, webhook secrets)
3. **Use strong passwords** (min 8 chars, letters + numbers)
4. **Monitor admin access** via user activity tracking
5. **Update dependencies** regularly for security patches

---

## 🌐 Deployment

### Frontend (Vercel)

```bash
# One-time setup
1. Go to vercel.com/dashboard
2. Import repository: https://github.com/TheDevSumit44/shipguard-ai
3. Set environment variables (all VITE_* from .env)
4. Deploy

# Auto-redeploy on git push to main
```

**Environment Variables in Vercel:**
```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
VITE_BACKEND_URL (point to Render backend)
```

### Backend (Render)

```bash
# One-time setup
1. Go to render.com/dashboard
2. New Web Service → Connect GitHub repo
3. Root Directory: backend
4. Build Command: npm install
5. Start Command: npm start
6. Add environment variables (all from .env)
7. Deploy

# Auto-redeploy on git push to main
```

**Environment Variables in Render:**
```
PORT=5000
NODE_ENV=production
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
WEBHOOK_SECRET
PII_ENCRYPTION_KEY
ALLOWED_ORIGINS (include Vercel frontend URL)
```

---

## 🐛 Troubleshooting

### Google Sign-In Not Working
**Problem:** "Popup was blocked" or authentication fails

**Solutions:**
1. Check Firebase Console → Authentication → Google provider is **Enabled**
2. Verify domain is in **Authorized domains** list
3. Check that redirect URI matches deployed URL
4. Allow popups in browser for the domain

### Admin Access Denied
**Problem:** User receives "Admin access denied" error

**Reason:** Email is not in the admin whitelist

**Solutions:**
1. Add email to `ADMIN_EMAIL_WHITELIST` in `src/contexts/AuthContext.jsx`
2. Redeploy frontend
3. Clear browser cache and try again
4. Log out and log back in

### Shipments/Alerts Not Loading
**Problem:** Dashboard shows empty data

**Solutions:**
1. Check Firestore in Firebase Console - verify collections exist (shipments, alerts, users)
2. Verify `.env` has correct `VITE_FIREBASE_PROJECT_ID`
3. Check browser console for errors
4. Verify Firestore security rules allow read access
5. Restart frontend dev server

### Backend Won't Start
**Problem:** "Firebase credentials not configured" or "ENOENT" errors

**Solutions:**
1. Verify `backend/.env` exists with all required Firebase vars
2. Check service account JSON format is correct
3. Verify port 5000 is not in use: `lsof -i :5000`
4. Restart backend: `cd backend && npm run dev`

---

## 📈 Performance

- **Frontend:** Vite hot module replacement for instant feedback
- **Backend:** Express with rate limiting and caching
- **Database:** Firestore real-time sync with efficient queries
- **Build Size:** ~150KB gzipped (optimized Vite build)
- **Load Time:** <2s on modern networks

---

## 🔮 Future Enhancements

- [ ] SMS and email notifications for critical alerts
- [ ] Advanced ML prediction models for delay forecasting
- [ ] Multi-tenant support with workspace isolation
- [ ] Custom report builder and scheduling
- [ ] API keys for third-party integrations
- [ ] Mobile app (React Native)
- [ ] Real-time collaboration features
- [ ] Advanced audit logging

---

## 📄 License

MIT License - See LICENSE file for details

---

## 👨‍💻 Author

**TheDevSumit44**

- GitHub: [@TheDevSumit44](https://github.com/TheDevSumit44)
- Project: [ShipGuard AI](https://github.com/TheDevSumit44/shipguard-ai)

---

<div align="center">

**Made with ❤️ for logistics professionals**

[⬆ Back to Top](#-shipguard-ai)

</div>
