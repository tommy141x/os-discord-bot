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
