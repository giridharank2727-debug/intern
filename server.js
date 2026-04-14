const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const db = require("./db");

const app = express();

app.use(cors());
app.use(bodyParser.json());


// 🔐 REGISTER
app.post("/register", (req, res) => {
    const { name, email, password } = req.body;

    const check = "SELECT * FROM users WHERE email = ?";

    db.query(check, [email], (err, result) => {
        if (result.length > 0) {
            return res.json({ success: false, message: "User exists" });
        }

        const sql = "INSERT INTO users (name, email, password) VALUES (?, ?, ?)";

        db.query(sql, [name, email, password], (err) => {
            if (err) return res.json(err);

            res.json({ success: true, message: "Registered Successfully" });
        });
    });
});


// 🔐 LOGIN
app.post("/login", (req, res) => {
    const { email, password } = req.body;

    const sql = "SELECT * FROM users WHERE email = ? AND password = ?";

    db.query(sql, [email, password], (err, result) => {
        if (result.length > 0) {
            res.json({ success: true, user: result[0] });
        } else {
            res.json({ success: false, message: "Invalid Credentials" });
        }
    });
});


// 🚀 TEST ROUTE
app.get("/", (req, res) => {
    res.send("🚀 SkillSprint API is running");
});


// 🚀 START SERVER (🔥 THIS WAS MISSING)
app.listen(5000, () => {
    console.log("Server running at http://localhost:5000 🚀");
});