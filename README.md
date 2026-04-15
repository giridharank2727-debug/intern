# GigIntern

This project is now organized into three directories:

- `frontend/` - UI pages for login, registration, and dashboard
- `backend/` - Node.js API server and database connection
- `database/` - SQL schema for MySQL

## Setup

1. Install backend dependencies:

   ```bash
   cd backend
   npm install
   ```

2. Create the database using MySQL and the schema in `database/schema.sql`.

3. Start the backend server:

   ```bash
   npm start
   ```

4. Open `frontend/index.html` in your browser or visit `http://localhost:5000` if serving static files from the backend.

## Notes

- The app uses `localStorage` for session data in the frontend.
- Dark mode is saved with `localStorage` and will not hide the app name.
- The backend includes simple `/register` and `/login` routes.
