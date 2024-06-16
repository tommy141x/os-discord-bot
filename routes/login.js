const express = require("express");
const passport = require("passport");
const Strategy = require("passport-discord").Strategy;
const config = require("../config.json");
const router = express.Router();

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

passport.use(
  new Strategy(
    {
      clientID: config.clientID,
      clientSecret: config.clientSecret,
      callbackURL: config.publicURL + "/login/callback",
      scope: ["identify"],
    },
    (accessToken, refreshToken, profile, done) => {
      process.nextTick(() => done(null, profile));
    },
  ),
);

router.get("/", (req, res) => {
  if (req.isAuthenticated()) {
    res.redirect("/");
  } else {
    res.send(`
      <html>
      <head>
        <title>Login</title>
        <style>
          body {
          display: flex;
          flex-direction: column;
            background-color: #222222;
            color: #ffffff;
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
          }
          h1 {
            text-align: center;
          }
          p {
            text-align: center;
          }
          button {
            background-color: #333333;
            color: white;
            border: none;
            border-radius: 0.5rem;
            padding: 0.7rem 1rem;
            cursor: pointer;
            transition: background-color 0.3s;
            outline: none;
          }
          button:hover {
            background-color: #444444;
          }
        </style>
      </head>
      <body>
        <h1>Login</h1>
        <p>Click the button below to log in with Discord:</p>
        <a href="/login/auth">
          <button>Login with Discord</button>
        </a>
      </body>
      </html>

    `);
  }
});

router.get("/auth", passport.authenticate("discord"));

router.get(
  "/callback",
  passport.authenticate("discord", { failureRedirect: "/" }),
  (req, res) => {
    res.redirect(req.session.returnTo || "/");
  },
);

module.exports = router;
