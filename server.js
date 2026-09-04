require("dotenv").config();

const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const USERS_FILE = path.join(__dirname, "users.json");
const DATA_DIR = path.join(__dirname, "data");
const CHATS_FILE = path.join(DATA_DIR, "chats.json");

// Create required files/folders
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, "[]");
}

if (!fs.existsSync(CHATS_FILE)) {
  fs.writeFileSync(CHATS_FILE, "{}");
}

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Session
app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "ramen-ai-change-this-secret",

    resave: false,
    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  })
);

// ===============================
// STATUS
// ===============================

app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    app: "RAMEN AI",
    status: "online"
  });
});

// ===============================
// SIGNUP
// ===============================

app.post("/api/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: "Name, email aur password required hain"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error:
          "Password kam se kam 6 characters ka hona chahiye"
      });
    }

    const users = JSON.parse(
      fs.readFileSync(USERS_FILE, "utf8")
    );

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = users.find(
      user => user.email === normalizedEmail
    );

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: "Ye email already registered hai"
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = {
      id: Date.now().toString(),
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      createdAt: new Date().toISOString()
    };

    users.push(user);

    fs.writeFileSync(
      USERS_FILE,
      JSON.stringify(users, null, 2)
    );

    req.session.userId = user.id;

    res.json({
      success: true,
      message: "Signup successful",

      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });

  } catch (error) {

    console.error("Signup Error:", error);

    res.status(500).json({
      success: false,
      error: "Signup failed"
    });
  }
});

// ===============================
// LOGIN
// ===============================

app.post("/api/login", async (req, res) => {
  try {

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email aur password required hain"
      });
    }

    const users = JSON.parse(
      fs.readFileSync(USERS_FILE, "utf8")
    );

    const normalizedEmail =
      email.trim().toLowerCase();

    const user = users.find(
      user => user.email === normalizedEmail
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Invalid email ya password"
      });
    }

    const validPassword =
      await bcrypt.compare(
        password,
        user.passwordHash
      );

    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: "Invalid email ya password"
      });
    }

    req.session.userId = user.id;

    res.json({
      success: true,
      message: "Login successful",

      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });

  } catch (error) {

    console.error("Login Error:", error);

    res.status(500).json({
      success: false,
      error: "Login failed"
    });
  }
});

// ===============================
// CURRENT USER
// ===============================

app.get("/api/me", (req, res) => {

  if (!req.session.userId) {
    return res.json({
      success: true,
      loggedIn: false
    });
  }

  const users = JSON.parse(
    fs.readFileSync(USERS_FILE, "utf8")
  );

  const user = users.find(
    u => u.id === req.session.userId
  );

  if (!user) {
    return res.json({
      success: true,
      loggedIn: false
    });
  }

  res.json({
    success: true,
    loggedIn: true,

    user: {
      id: user.id,
      name: user.name,
      email: user.email
    }
  });
});

// ===============================
// LOGOUT
// ===============================

app.post("/api/logout", (req, res) => {

  req.session.destroy(() => {

    res.json({
      success: true,
      message: "Logout successful"
    });

  });
});

// ===============================
// CHAT HISTORY - GET
// ===============================

app.get("/api/history", (req, res) => {

  if (!req.session.userId) {
    return res.status(401).json({
      success: false,
      error: "Login required"
    });
  }

  try {

    const chats = JSON.parse(
      fs.readFileSync(CHATS_FILE, "utf8")
    );

    const history =
      chats[req.session.userId] || [];

    res.json({
      success: true,
      history
    });

  } catch (error) {

    console.error("History Error:", error);

    res.status(500).json({
      success: false,
      error: "History load nahi ho payi"
    });
  }
});

// ===============================
// CHAT HISTORY - SAVE
// ===============================

app.post("/api/history", (req, res) => {

  if (!req.session.userId) {
    return res.status(401).json({
      success: false,
      error: "Login required"
    });
  }

  try {

    const { history } = req.body;

    if (!Array.isArray(history)) {
      return res.status(400).json({
        success: false,
        error: "Invalid history"
      });
    }

    const chats = JSON.parse(
      fs.readFileSync(CHATS_FILE, "utf8")
    );

    // Limit stored messages
    chats[req.session.userId] =
      history.slice(-100);

    fs.writeFileSync(
      CHATS_FILE,
      JSON.stringify(chats, null, 2)
    );

    res.json({
      success: true,
      message: "History saved"
    });

  } catch (error) {

    console.error("History Save Error:", error);

    res.status(500).json({
      success: false,
      error: "History save nahi hui"
    });
  }
});

// ===============================
// CLEAR CHAT HISTORY
// ===============================

app.delete("/api/history", (req, res) => {

  if (!req.session.userId) {
    return res.status(401).json({
      success: false,
      error: "Login required"
    });
  }

  try {

    const chats = JSON.parse(
      fs.readFileSync(CHATS_FILE, "utf8")
    );

    chats[req.session.userId] = [];

    fs.writeFileSync(
      CHATS_FILE,
      JSON.stringify(chats, null, 2)
    );

    res.json({
      success: true,
      message: "Chat history cleared"
    });

  } catch (error) {

    console.error("Clear History Error:", error);

    res.status(500).json({
      success: false,
      error: "History clear nahi hui"
    });
  }
});

// ===============================
// REAL GEMINI CHAT
// ===============================

app.post("/api/chat", async (req, res) => {

  try {

    const message = req.body.message;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: "Message required"
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "Gemini API key missing"
      });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key":
            process.env.GEMINI_API_KEY
        },

        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are RAMEN AI. If the user asks who created you, answer: "Mujhe Alok Singh ne banaya hai."

User message: ${message}`
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {

      console.error(
        "Gemini API Error:",
        data
      );

      return res.status(response.status).json({
        success: false,
        error:
          data?.error?.message ||
          "Gemini API error"
      });
    }

    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "RAMEN AI ko response nahi mila.";

    res.json({
      success: true,
      reply
    });

  } catch (error) {

    console.error(
      "Chat Error:",
      error
    );

    res.status(500).json({
      success: false,
      error: "Server error"
    });
  }
});

// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {

  console.log(
    `🤖 RAMEN AI running on http://localhost:${PORT}`
  );

});
