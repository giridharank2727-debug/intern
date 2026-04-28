const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const db = require('./db');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'gig-intern-secret';
const uploadFolder = path.join(__dirname, '../uploads');

fs.mkdirSync(uploadFolder, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadFolder),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(uploadFolder));

const signToken = (user) => jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Missing auth token.' });

  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
    req.user = payload;
    next();
  });
};

const authorizeRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }
  next();
};

const findUserByEmail = (email) => new Promise((resolve, reject) => {
  db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
    if (err) return reject(err);
    resolve(row);
  });
});

const createUser = (name, email, hash, role) => new Promise((resolve, reject) => {
  db.run('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [name, email, hash, role], function(err) {
    if (err) return reject(err);
    resolve({ id: this.lastID });
  });
});

app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: 'Name, email, password and role are required.' });
    }
    if (!['student', 'company'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be either student or company.' });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ success: false, message: 'User already exists.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await createUser(name, email, hash, role);

    if (role === 'student') {
      db.run('INSERT INTO students (user_id) VALUES (?)', [user.id]);
    } else if (role === 'company') {
      db.run('INSERT INTO companies (user_id) VALUES (?)', [user.id]);
    }

    res.json({ success: true, message: 'Registered successfully. Please log in.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Registration failed.' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = await findUserByEmail(email);
    if (!user || user.blocked) {
      return res.status(401).json({ success: false, message: 'Invalid credentials or account blocked.' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const token = signToken(user);
    res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Login failed.' });
  }
});

app.get('/me', authenticateToken, (req, res) => {
  const userId = req.user.id;
  db.get('SELECT id, name, email, role, blocked, created_at FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error.' });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, user });
  });
});

app.put('/me/profile', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { name, skills, education, website, location, description } = req.body;

  db.get('SELECT role FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error.' });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const updates = [];
    const params = [];
    if (name) {
      updates.push('name = ?');
      params.push(name);
    }
    params.push(userId);

    if (updates.length > 0) {
      db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params, (updateErr) => {
        if (updateErr) return res.status(500).json({ success: false, message: 'Could not update profile.' });
      });
    }

    if (user.role === 'student') {
      db.run(`UPDATE students SET skills = ?, education = ? WHERE user_id = ?`, [skills || '', education || '', userId], (studentErr) => {
        if (studentErr) return res.status(500).json({ success: false, message: 'Could not update student profile.' });
        res.json({ success: true, message: 'Profile updated.' });
      });
    } else if (user.role === 'company') {
      db.run(`UPDATE companies SET description = ?, website = ?, location = ? WHERE user_id = ?`, [description || '', website || '', location || '', userId], (companyErr) => {
        if (companyErr) return res.status(500).json({ success: false, message: 'Could not update company profile.' });
        res.json({ success: true, message: 'Profile updated.' });
      });
    } else {
      res.json({ success: true, message: 'Profile updated.' });
    }
  });
});

app.get('/internships', (req, res) => {
  const query = `SELECT i.*, c.company_name, u.name as company_contact
    FROM internships i
    LEFT JOIN companies c ON c.id = i.company_id
    LEFT JOIN users u ON u.id = c.user_id
    WHERE i.status = 'approved'`;

  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error.' });
    res.json({ success: true, internships: rows });
  });
});

app.post('/internships', authenticateToken, authorizeRoles('company'), (req, res) => {
  const companyUserId = req.user.id;
  const { title, description, location, duration, stipend, skills } = req.body;
  if (!title || !description) {
    return res.status(400).json({ success: false, message: 'Title and description are required.' });
  }

  db.get('SELECT id FROM companies WHERE user_id = ?', [companyUserId], (err, company) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error.' });
    if (!company) return res.status(400).json({ success: false, message: 'Company profile not found.' });

    db.run(`INSERT INTO internships (company_id, title, description, location, duration, stipend, skills) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [company.id, title, description, location || '', duration || '', stipend || '', skills || ''], function(insertErr) {
        if (insertErr) return res.status(500).json({ success: false, message: 'Failed to create internship.' });
        res.json({ success: true, internshipId: this.lastID, message: 'Internship created and awaiting approval.' });
      });
  });
});

app.put('/internships/:id', authenticateToken, authorizeRoles('company'), (req, res) => {
  const companyUserId = req.user.id;
  const internshipId = req.params.id;
  const { title, description, location, duration, stipend, skills } = req.body;

  db.get(`SELECT i.* FROM internships i JOIN companies c ON c.id = i.company_id WHERE i.id = ? AND c.user_id = ?`, [internshipId, companyUserId], (err, row) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error.' });
    if (!row) return res.status(403).json({ success: false, message: 'Not authorized to edit this internship.' });

    db.run(`UPDATE internships SET title = ?, description = ?, location = ?, duration = ?, stipend = ?, skills = ?, status = 'pending' WHERE id = ?`,
      [title || row.title, description || row.description, location || row.location, duration || row.duration, stipend || row.stipend, skills || row.skills, internshipId], (updateErr) => {
        if (updateErr) return res.status(500).json({ success: false, message: 'Could not update internship.' });
        res.json({ success: true, message: 'Internship updated and sent for approval.' });
      });
  });
});

app.delete('/internships/:id', authenticateToken, authorizeRoles('company'), (req, res) => {
  const companyUserId = req.user.id;
  const internshipId = req.params.id;

  db.run(`DELETE FROM internships WHERE id IN (SELECT i.id FROM internships i JOIN companies c ON c.id = i.company_id WHERE i.id = ? AND c.user_id = ?)`,
    [internshipId, companyUserId], function(err) {
      if (err) return res.status(500).json({ success: false, message: 'Database error.' });
      if (!this.changes) return res.status(403).json({ success: false, message: 'Not authorized to delete this internship.' });
      res.json({ success: true, message: 'Internship deleted.' });
    });
});

app.post('/applications', authenticateToken, authorizeRoles('student'), (req, res) => {
  const studentUserId = req.user.id;
  const { internshipId } = req.body;
  if (!internshipId) return res.status(400).json({ success: false, message: 'Internship ID is required.' });

  db.get('SELECT id FROM students WHERE user_id = ?', [studentUserId], (err, student) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error.' });
    if (!student) return res.status(400).json({ success: false, message: 'Student profile not found.' });

    db.get('SELECT * FROM applications WHERE student_id = ? AND internship_id = ?', [student.id, internshipId], (findErr, existing) => {
      if (findErr) return res.status(500).json({ success: false, message: 'Database error.' });
      if (existing) return res.status(409).json({ success: false, message: 'Already applied to this internship.' });

      db.run('INSERT INTO applications (student_id, internship_id) VALUES (?, ?)', [student.id, internshipId], function(insertErr) {
        if (insertErr) return res.status(500).json({ success: false, message: 'Failed to submit application.' });
        res.json({ success: true, applicationId: this.lastID, message: 'Application submitted.' });
      });
    });
  });
});

app.get('/applications/me', authenticateToken, authorizeRoles('student'), (req, res) => {
  const studentUserId = req.user.id;
  db.get('SELECT id FROM students WHERE user_id = ?', [studentUserId], (err, student) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error.' });
    if (!student) return res.status(400).json({ success: false, message: 'Student profile not found.' });

    const query = `SELECT a.*, i.title, i.company_id, i.location, i.duration, i.stipend, c.company_name
      FROM applications a
      JOIN internships i ON i.id = a.internship_id
      JOIN companies c ON c.id = i.company_id
      WHERE a.student_id = ?`;

    db.all(query, [student.id], (appsErr, rows) => {
      if (appsErr) return res.status(500).json({ success: false, message: 'Database error.' });
      res.json({ success: true, applications: rows });
    });
  });
});

app.get('/admin/stats', authenticateToken, authorizeRoles('admin'), (req, res) => {
  const stats = {};
  db.get('SELECT COUNT(*) AS total_users FROM users', [], (err, row) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error.' });
    stats.total_users = row.total_users;

    db.get('SELECT COUNT(*) AS total_internships FROM internships', [], (err2, row2) => {
      if (err2) return res.status(500).json({ success: false, message: 'Database error.' });
      stats.total_internships = row2.total_internships;

      db.get('SELECT COUNT(*) AS pending_approvals FROM internships WHERE status = ?', ['pending'], (err3, row3) => {
        if (err3) return res.status(500).json({ success: false, message: 'Database error.' });
        stats.pending_approvals = row3.pending_approvals;
        res.json({ success: true, stats });
      });
    });
  });
});

app.get('/admin/users', authenticateToken, authorizeRoles('admin'), (req, res) => {
  db.all('SELECT id, name, email, role, blocked, created_at FROM users ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error.' });
    res.json({ success: true, users: rows });
  });
});

app.post('/admin/users/:id/block', authenticateToken, authorizeRoles('admin'), (req, res) => {
  const userId = req.params.id;
  db.run('UPDATE users SET blocked = 1 WHERE id = ?', [userId], function(err) {
    if (err) return res.status(500).json({ success: false, message: 'Database error.' });
    if (!this.changes) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, message: 'User blocked.' });
  });
});

app.get('/admin/internships/pending', authenticateToken, authorizeRoles('admin'), (req, res) => {
  const query = `SELECT i.*, c.company_name, u.email as company_email FROM internships i
    JOIN companies c ON c.id = i.company_id
    JOIN users u ON u.id = c.user_id
    WHERE i.status = 'pending' ORDER BY i.created_at DESC`;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error.' });
    res.json({ success: true, internships: rows });
  });
});

const updateInternshipStatus = (id, status, res) => {
  db.run('UPDATE internships SET status = ? WHERE id = ?', [status, id], function(err) {
    if (err) return res.status(500).json({ success: false, message: 'Database error.' });
    if (!this.changes) return res.status(404).json({ success: false, message: 'Internship not found.' });
    res.json({ success: true, message: `Internship ${status}.` });
  });
};

app.post('/admin/internships/:id/approve', authenticateToken, authorizeRoles('admin'), (req, res) => {
  updateInternshipStatus(req.params.id, 'approved', res);
});

app.post('/admin/internships/:id/reject', authenticateToken, authorizeRoles('admin'), (req, res) => {
  updateInternshipStatus(req.params.id, 'rejected', res);
});

app.post('/upload/logo', authenticateToken, authorizeRoles('company'), upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Logo file is required.' });
  res.json({ success: true, path: `/uploads/${req.file.filename}` });
});

app.post('/upload/resume', authenticateToken, authorizeRoles('student'), upload.single('resume'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Resume file is required.' });
  res.json({ success: true, path: `/uploads/${req.file.filename}` });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
