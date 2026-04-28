const path = require('path');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '../database/skillsprint.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('DB connection error:', err.message);
  } else {
    console.log('SQLite connected successfully', dbPath);
  }
});

const createTables = () => {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      company_name TEXT,
      description TEXT,
      website TEXT,
      location TEXT,
      logo_path TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      skills TEXT,
      education TEXT,
      resume_path TEXT,
      photo_path TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS internships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      location TEXT,
      duration TEXT,
      stipend TEXT,
      skills TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(company_id) REFERENCES companies(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      internship_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(student_id) REFERENCES students(id),
      FOREIGN KEY(internship_id) REFERENCES internships(id)
    )`);

    db.all('PRAGMA table_info(users)', [], (err, columns) => {
      if (err) {
        console.error('Migration error:', err.message);
        return;
      }

      const names = columns.map(col => col.name);
      if (!names.includes('role')) {
        db.run("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student'", (alterErr) => {
          if (alterErr) console.error('Could not add role column:', alterErr.message);
        });
      }
      if (!names.includes('blocked')) {
        db.run("ALTER TABLE users ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0", (alterErr) => {
          if (alterErr) console.error('Could not add blocked column:', alterErr.message);
        });
      }
      if (!names.includes('created_at')) {
        db.run("ALTER TABLE users ADD COLUMN created_at DATETIME", (alterErr) => {
          if (alterErr) console.error('Could not add created_at column:', alterErr.message);
        });
      }
    });
  });
};

const seedAdmin = async () => {
  db.get('SELECT id FROM users WHERE email = ?', ['admin@gigintern.com'], async (err, row) => {
    if (err) return console.error('Admin seed error:', err.message);
    if (!row) {
      const passwordHash = await bcrypt.hash('Admin@123', 10);
      db.run('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', ['Admin', 'admin@gigintern.com', passwordHash, 'admin'], (insertErr) => {
        if (insertErr) console.error('Could not seed admin user:', insertErr.message);
        else console.log('Admin user created: admin@gigintern.com / Admin@123');
      });
    }
  });
};

createTables();
seedAdmin();

module.exports = db;
