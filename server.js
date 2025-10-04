// server.js
import express from "express";
import session from "express-session";
import fetch from "node-fetch";
import multer from "multer";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import dotenv from "dotenv";
import path from "path";

dotenv.config();
const app = express();
const upload = multer({ dest: "uploads/" });

// EJS template engine
app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: "secret", resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

// === Google OAuth ===
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "/auth/google/callback"
}, (accessToken, refreshToken, profile, done) => done(null, profile)));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => res.redirect("/")
);
app.get("/logout", (req, res) => { req.logout(() => {}); res.redirect("/"); });

// === Hafızada Chat Geçmişi ===
const chatHistory = {}; // { userId: [{ name: "sohbet1", messages: [...] }, ...] }

// === API routes ===
app.get("/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in" });
  res.json(req.user);
});

// Chat endpoint
app.post("/chat", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Login required" });
  const { message, sessionName } = req.body;

  const userId = req.user.id;
  if (!chatHistory[userId]) chatHistory[userId] = [];

  let session = chatHistory[userId].find(s => s.name === sessionName);
  if (!session) {
    session = { name: sessionName || "Yeni Sohbet", messages: [] };
    chatHistory[userId].push(session);
  }

  session.messages.push({ role: "user", content: message });

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: session.messages
    })
  });

  const data = await response.json();
  const botMessage = data.choices?.[0]?.message?.content;
  session.messages.push({ role: "assistant", content: botMessage });

  res.json(data);
});

// Chat geçmişi listeleme
app.get("/history", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Login required" });
  res.json(chatHistory[req.user.id] || []);
});

// === Image Generation ===
app.post("/image/generate", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Login required" });
  const { prompt, size } = req.body;

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: size || "512x512"
    })
  });

  const data = await response.json();
  res.json(data);
});

// Upload endpoint
app.post("/image/upload", upload.single("file"), (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Login required" });
  res.json({ filePath: req.file.path });
});

// === Frontend ===
app.get("/", (req, res) => {
  res.render("index", { user: req.user });
});

app.listen(5000, () => console.log("🚀 Çalışıyor: http://localhost:5000"));
