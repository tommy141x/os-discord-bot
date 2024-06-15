const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  const username = req.user ? req.user.username : "";
  res.send(`
    <html>
    <head>
      <title>Dashboard</title>
      <style>
        /* Your CSS styles */
        .sidebar {
          width: 250px;
          height: 100%;
          background-color: #f0f0f0;
          padding: 20px;
          box-sizing: border-box;
          float: left;
        }
        .content {
          margin-left: 270px; /* Adjust this to match your sidebar width */
          padding: 20px;
        }
        .hidden {
          display: none;
        }
      </style>
    </head>
    <body>
      <div class="sidebar">
        <div class="sidebar-header">
          <h1 class="sidebar-header-title">Welcome, ${username}!</h1>
        </div>
        <div class="sidebar-menu">
          <ul class="sidebar-menu-list">
            <li>
              <a href="#" onclick="loadContent('/overview')">Overview</a>
            </li>
            <li>
              <a href="#" onclick="loadContent('/server-settings')">Server Settings</a>
            </li>
            <li>
              <a href="#" onclick="loadContent('/embed-messages')">Embed Messages</a>
            </li>
            <li>
              <a href="#" onclick="loadContent('/utility')">Utility</a>
            </li>
            <li>
              <a href="#" onclick="loadContent('/moderation')">Moderation</a>
            </li>
            <li>
              <a href="#" onclick="loadContent('/automod')">AutoMod</a>
            </li>
            <li>
              <a href="#" onclick="loadContent('/welcome-goodbye')">Welcome/Goodbye</a>
            </li>
            <li>
              <a href="#" onclick="loadContent('/auto-responder')">Auto Responder</a>
            </li>
            <li>
              <a href="#" onclick="loadContent('/leveling-system')">Leveling System</a>
            </li>
            <li>
              <a href="#" onclick="loadContent('/auto-roles')">Auto Roles</a>
            </li>
            <li>
              <a href="#" onclick="loadContent('/logs')">Logs</a>
            </li>
            <li>
              <a href="#" onclick="loadContent('/colors')">Colors</a>
            </li>
            <li>
              <a href="#" onclick="loadContent('/self-assignable-roles')">Self-Assignable Roles</a>
            </li>
            <li>
              <a href="#" onclick="loadContent('/starboard')">Starboard</a>
            </li>
            <li>
              <a href="#" onclick="loadContent('/temporary-channels')">Temporary Channels</a>
            </li>
            <li>
              <a href="#" onclick="loadContent('/anti-raid')">Anti-Raid</a>
            </li>
            <li>
              <a href="#" onclick="loadContent('/social-alerts')">Social Alerts</a>
            </li>
            <li>
              <a href="#" onclick="loadContent('/control-panel-logs')">Control Panel Logs</a>
            </li>
            <li>
              <a href="#" onclick="loadContent('/mod-actions')">Mod Actions</a>
            </li>
          </ul>
          <div class="logout">
                    <button onclick="logout()">Logout</button>
                  </div>
        </div>
      </div>
      <div class="content" id="content">
        <!-- Content will be loaded here -->
      </div>

      <script>
        function loadContent(route) {
          fetch(route)
            .then(response => response.text())
            .then(data => document.getElementById('content').innerHTML = data)
            .catch(error => console.error('Error:', error));
        }

        function logout() {
                  fetch('/logout')
                    .then(() => window.location.href = '/login')
                    .catch(error => console.error('Error:', error));
                }

        // Load the overview page by default
        window.addEventListener('load', function() {
          loadContent('/overview');
        });
      </script>


    </body>
    </html>
  `);
});

module.exports = router;
