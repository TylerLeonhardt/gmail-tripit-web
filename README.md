# gmail-tripit-web

**A web application for manual review and classification of potential flight confirmation emails.**

This system presents candidate emails one at a time in a card-based, Tinder-style interface where users can swipe right (or click "Yes") for flight confirmations and swipe left (or click "No") for non-flight emails.

## 🎯 Key Features

- **Smart Classification**: Uses relaxed confidence thresholds (30-40%) to maximize recall
- **Intuitive UI**: Card-based interface with keyboard shortcuts for rapid review
- **Real-time Stats**: Track your progress as you review emails
- **Undo Support**: Easily correct mistakes with one-click undo
- **Production Ready**: Full TypeScript, comprehensive tests, proper error handling

## 🏗️ Architecture

- **Backend**: Node.js + Express.js + TypeScript with SQLite database
- **Frontend**: React + Vite + TypeScript with responsive design
- **Gmail Integration**: OAuth2 for secure email access
- **Testing**: Jest (backend) and Vitest (frontend) with 62+ tests

## 📊 Test Coverage

- **Backend**: 45 tests passing with excellent coverage
  - Database Manager: 100% coverage
  - Email Classifier: 100% coverage
  - API Routes: 83.6% coverage
- **Frontend**: 17 tests passing
  - Component tests for EmailCard, Controls, and Stats

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Gmail API credentials (OAuth 2.0)
- TypeScript knowledge

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/TylerLeonhardt/gmail-tripit-web.git
   cd gmail-tripit-web
   ```

2. **Set up the backend**
   ```bash
   cd backend
   npm install
   ```

3. **Set up the frontend**
   ```bash
   cd ../frontend
   npm install
   ```

4. **Configure Gmail API** (optional for local development)
   - Create a project at [Google Cloud Console](https://console.cloud.google.com)
   - Enable Gmail API
   - Create OAuth 2.0 credentials
   - Download `credentials.json` to `config/`

### Development

Run backend and frontend in separate terminals:

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev  # Starts on http://localhost:8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev  # Starts on http://localhost:5173
```

Visit http://localhost:5173 to use the application.

### Building for Production

**Build backend:**
```bash
cd backend
npm run build
npm start
```

**Build frontend:**
```bash
cd frontend
npm run build
npm run preview
```

## 🧪 Testing

**Backend tests:**
```bash
cd backend
npm test                  # Run all tests
npm run test:coverage    # Run with coverage report
```

**Frontend tests:**
```bash
cd frontend
npm test                 # Run tests in watch mode
npm test -- --run       # Run tests once
```

## 🎨 Code Quality

**Backend linting:**
```bash
cd backend
npm run lint       # ESLint check
npm run format     # Prettier format
npm run typecheck  # TypeScript check
```

**Frontend linting:**
```bash
cd frontend
npm run lint       # ESLint check
npm run format     # Prettier format
```

## 📖 API Documentation

### Endpoints

- `GET /api/health` - Health check
- `GET /api/emails/next-batch?batch_size=20` - Get unreviewed emails
- `POST /api/emails/review` - Submit review decision
- `POST /api/emails/undo` - Undo last review
- `GET /api/stats` - Get review statistics
- `GET /api/emails/search?q=query` - Search emails

### Example Request

```bash
curl -X POST http://localhost:8000/api/emails/review \
  -H "Content-Type: application/json" \
  -d '{"email_id": "msg123", "is_flight_confirmation": true}'
```

## ⌨️ Keyboard Shortcuts

- `Y` or `→` - Mark as flight confirmation
- `N` or `←` - Mark as not a flight
- `U` - Undo last decision
- `H` - Toggle email content visibility

## 📁 Project Structure

```
gmail-tripit-web/
├── backend/              # Express.js + TypeScript backend
│   ├── src/
│   │   ├── server.ts    # Main server
│   │   ├── database.ts  # SQLite manager
│   │   ├── classifier.ts # Email scoring
│   │   ├── routes.ts    # API endpoints
│   │   └── types.ts     # TypeScript types
│   └── package.json
├── frontend/            # React + Vite frontend
│   ├── src/
│   │   ├── App.tsx      # Main app component
│   │   ├── components/  # React components
│   │   └── api.ts       # API client
│   └── package.json
├── config/              # Configuration files
├── data/                # SQLite database storage
└── README.md
```

## 🔒 Security

- OAuth2 for Gmail authentication
- Email HTML content sandboxed in iframes
- Input validation on all API endpoints
- SQL injection prevention with prepared statements
- CORS configured for specific origins
- Credentials excluded from repository via .gitignore

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

MIT

## 🙏 Acknowledgments

- Detailed specification in `spec.md`
- Gmail API documentation
- React and Vite communities