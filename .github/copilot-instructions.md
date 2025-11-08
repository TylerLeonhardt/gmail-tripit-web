# GitHub Copilot Instructions for gmail-tripit-web

## Project Overview

This repository contains a web application for manual review and classification of potential flight confirmation emails. The system presents candidate emails one at a time in a card-based, Tinder-style interface where users can swipe right (or click "Yes") for flight confirmations and swipe left (or click "No") for non-flight emails.

**Architecture**: Node.js + TypeScript backend with Express.js, React or vanilla JavaScript frontend with card-swiping UI, and SQLite for tracking review decisions.

**Key Goal**: Use relaxed classification thresholds (30-40% confidence) to maximize recall, letting users make final classification decisions through an intuitive review process.

## Repository Structure

```
gmail-tripit-web/
├── README.md           # Project overview
├── spec.md            # Detailed technical specification
├── backend/           # Express.js + TypeScript backend (when implemented)
│   ├── src/
│   │   ├── server.ts      # Main Express server
│   │   ├── database.ts    # SQLite database manager
│   │   ├── gmail-client.ts # Gmail API integration
│   │   ├── classifier.ts  # Email classification logic
│   │   └── routes.ts      # API endpoints
│   └── package.json
├── frontend/          # React + Vite frontend (when implemented)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   └── api/
│   └── package.json
├── config/           # Configuration files
└── data/             # SQLite database storage
```

## Development Setup

### Prerequisites
- Node.js 18+ and npm
- Gmail API credentials (OAuth 2.0)
- TypeScript knowledge

### Installation (when code is implemented)

**Backend:**
```bash
cd backend
npm install
npm run dev  # Starts development server with nodemon
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev  # Starts Vite dev server
```

### Building

**Backend:**
```bash
cd backend
npm run build  # Compiles TypeScript
```

**Frontend:**
```bash
cd frontend
npm run build  # Builds production bundle
```

## Testing Strategy

### Backend Tests
- Unit tests for email classification logic
- Integration tests for API endpoints
- Database tests with in-memory SQLite
- Gmail API mocking for testing

**Run tests:**
```bash
cd backend
npm test
npm run test:coverage  # With coverage report
```

### Frontend Tests
- Component tests for React components
- Integration tests for user workflows
- E2E tests for complete review flow

**Run tests:**
```bash
cd frontend
npm test
```

## Linting and Code Quality

### Backend
```bash
cd backend
npm run lint       # ESLint with TypeScript support
npm run format     # Prettier formatting
npm run typecheck  # TypeScript type checking
```

### Frontend
```bash
cd frontend
npm run lint       # ESLint + React rules
npm run format     # Prettier formatting
npm run typecheck  # TypeScript type checking
```

## Code Conventions

### TypeScript
- Use strict TypeScript configuration
- Define interfaces for all data structures (EmailCard, ReviewDecision, etc.)
- Prefer async/await over promises
- Use meaningful variable names (no single letters except loop counters)

### Backend Conventions
- Express routes should use proper HTTP methods (GET, POST, PUT, DELETE)
- Always validate request bodies and query parameters
- Use try-catch blocks and proper error responses
- Database queries should use prepared statements to prevent SQL injection
- Keep routes thin; move business logic to service modules

### Frontend Conventions
- Use functional components with hooks
- Keep components focused and single-purpose
- Extract reusable logic into custom hooks
- Use TypeScript for all component props
- Sanitize HTML content when displaying emails (use iframe with sandbox)

### Database Schema
The application uses three main tables:
- `email_candidates` - Emails awaiting review
- `review_decisions` - User classification decisions
- `confirmed_flights` - Confirmed flights ready for processing

Always use proper indexes and foreign key constraints.

## Security Considerations

### Critical Security Requirements
- **NEVER commit Gmail API credentials or OAuth tokens to the repository**
- Use environment variables for sensitive configuration
- Add `config/credentials.json` and `.env` files to `.gitignore`
- Sanitize email HTML content before display (use iframe sandbox)
- Validate all user input on both client and server
- Use CORS properly with specific origins (not wildcard `*`)
- Rate limit API endpoints to prevent abuse
- Use prepared statements for all database queries

### Gmail API
- Store OAuth tokens securely (not in database or code)
- Implement proper token refresh logic
- Use minimal required scopes (gmail.readonly)
- Respect Gmail API rate limits (100 requests/second)

## Key Files and Components

### Specification
- `spec.md` - Complete technical specification with architecture details, database schema, API endpoints, and deployment workflow

### Backend Components (to be implemented)
- `server.ts` - Main Express application setup
- `database.ts` - SQLite operations with better-sqlite3
- `gmail-client.ts` - Gmail API integration
- `classifier.ts` - Email confidence scoring logic
- `routes.ts` - REST API endpoints for review workflow

### Frontend Components (to be implemented)
- `App.tsx` - Main application component
- `EmailCard.tsx` - Card display for individual emails
- `Controls.tsx` - Review buttons and keyboard shortcuts
- `Stats.tsx` - Progress tracking display

## Common Tasks

### Adding a new API endpoint
1. Define TypeScript interfaces for request/response
2. Add route handler in `routes.ts`
3. Implement business logic in appropriate service
4. Add proper error handling
5. Update API documentation
6. Add tests for the new endpoint

### Modifying the classification logic
1. Update confidence scoring in `classifier.ts`
2. Ensure confidence threshold remains at 30-40% for recall
3. Add new detection reasons to the reasons array
4. Update tests to reflect new scoring
5. Document scoring changes

### Database schema changes
1. Write migration SQL
2. Update TypeScript interfaces
3. Update relevant queries in database.ts
4. Test with sample data
5. Update seed data if applicable

## Performance Guidelines

- Pre-fetch and cache email batches for fast loading
- Use database indexes for frequently queried fields
- Implement pagination for large result sets
- Use connection pooling for database
- Optimize Gmail API calls with batch requests
- Lazy load email HTML content in frontend

## Dependencies to Use

### Backend
- `express` - Web framework
- `cors` - CORS middleware
- `better-sqlite3` - Synchronous SQLite library
- `googleapis` - Gmail API client
- `typescript`, `ts-node`, `nodemon` - Development tools

### Frontend
- `react` - UI library
- `vite` - Build tool and dev server
- `react-tinder-card` - Card swipe component
- `typescript` - Type safety

## What NOT to Do

❌ **Don't** commit credentials or API keys
❌ **Don't** use synchronous operations in API routes
❌ **Don't** skip input validation on API endpoints
❌ **Don't** use `dangerouslySetInnerHTML` without sanitization
❌ **Don't** modify the database schema without migrations
❌ **Don't** remove existing tests without justification
❌ **Don't** increase the classification threshold above 40% (would reduce recall)
❌ **Don't** add dependencies without checking for security vulnerabilities

## Additional Resources

- Technical specification: See `spec.md` for complete implementation details
- Gmail API: https://developers.google.com/gmail/api
- React documentation: https://react.dev
- Express.js guide: https://expressjs.com
- TypeScript handbook: https://www.typescriptlang.org/docs

## Questions or Issues?

When working on this repository:
1. Always refer to `spec.md` for detailed technical requirements
2. Prioritize user experience (speed, keyboard shortcuts, clear feedback)
3. Maintain the balance between automation and human judgment
4. Focus on recall over precision (better to review extra emails than miss confirmations)
