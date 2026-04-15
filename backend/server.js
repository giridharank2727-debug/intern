const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

app.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.json({ success: false, message: 'All fields are required.' });
  }

  const findUser = 'SELECT * FROM users WHERE email = ?';
  db.query(findUser, [email], (err, result) => {
    if (err) return res.json({ success: false, message: 'Database error.' });
    if (result.length) {
      return res.json({ success: false, message: 'User already exists.' });
    }

    const insertUser = 'INSERT INTO users (name, email, password) VALUES (?, ?, ?)';
    db.query(insertUser, [name, email, password], insertErr => {
      if (insertErr) return res.json({ success: false, message: 'Could not register user.' });
      res.json({ success: true, message: 'Registered successfully.' });
    });
  });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.json({ success: false, message: 'Email and password are required.' });
  }

  const sql = 'SELECT * FROM users WHERE email = ? AND password = ?';
  db.query(sql, [email, password], (err, result) => {
    if (err) return res.json({ success: false, message: 'Database error.' });
    if (result.length) {
      return res.json({ success: true, user: result[0] });
    }
    res.json({ success: false, message: 'Invalid credentials.' });
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
