const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  const username = req.user ? req.user.username : "";
  res.send(`
    <html>
    <head>
      <title>Dashboard</title>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css">
      <style>
        .sidebar {
          width: 20rem;
          height: 100%;
          padding: 2rem;
          box-sizing: border-box;
          float: left;
          display: flex;
          flex-direction: column;
          align-items: center; /* Centering the buttons vertically */
          overflow-y: auto; /* Added to enable scrolling */
        }
        .sidebar-header {
          margin-bottom: 2rem;
          text-align: center; /* Centering the text horizontally */
        }
        .sidebar-header-title {
          color: #ffffff;
          font-size: 1.5rem;
          margin: 0;
        }
        .sidebar-menu {
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          align-items: center; /* Centering the buttons horizontally */
        }

        .sidebar-menu-item {
          background-color: #333333;
          color: white;
          border: none;
          border-radius: 0.5rem;
          width: 100%;
          padding: 0.7rem 1rem;
          cursor: pointer;
          transition: background-color 0.3s;
          margin-bottom: 0.5rem;
          display: flex;
          align-items: center; /* Aligning icon and text vertically */
        }
        .sidebar-menu-item:hover {
          background-color: #444444;
        }
        .sidebar-menu-item:focus {
          outline: none;
          background-color: #555555;
        }
        .sidebar-menu-item img {
          width: 20px;
          margin-right: 10px; /* Adjusted margin for spacing */
        }
        .sidebar-menu-item i {
          margin-right: 10px; /* Adjusted margin for spacing */
        }
        .sidebar-menu-item.selected {
          background-color: #555555;
        }
        .logout {
          width: 100%;
          text-align: center;
        }
        .logout button {
          background-color: #bf3930; /* Changed button color to red */
          color: white;
          border: none;
          border-radius: 20px;
          width: 100%;
          padding: 0.5rem 1rem;
          cursor: pointer;
          transition: background-color 0.3s;
          margin-bottom: 1rem;
        }
        .logout button:hover {
          background-color: #d42c20;
        }
        body {
        display: flex;
        justify-content: center;
        align-items: center;
        margin: 0;
        padding: 0;
        background-color: #222222;
        }

        .content {
        height: 90%;
        width: 80%;
        overflow: auto;
        border-radius: 1rem;
        margin: 1rem;
        padding: 1rem;
        background-color: #333333;
        color: white;
        }

        *::-webkit-scrollbar {
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

          <div class="sidebar-menu-item" onclick="loadContent('/overview')" tabindex="0">
            <i class="fas fa-home"></i>
            Overview
          </div>

          <div class="sidebar-menu-item" onclick="loadContent('/server-settings')" tabindex="0">
            <i class="fas fa-cogs"></i>
            Server Settings
          </div>

          <div class="sidebar-menu-item" onclick="loadContent('/embed-messages')" tabindex="0">
            <i class="fas fa-envelope"></i>
            Embed Messages
          </div>

          <div class="sidebar-menu-item" onclick="loadContent('/utility')" tabindex="0">
            <i class="fas fa-toolbox"></i>
            Utility
          </div>

          <div class="sidebar-menu-item" onclick="loadContent('/moderation')" tabindex="0">
            <i class="fas fa-ban"></i>
            Moderation
          </div>

          <div class="sidebar-menu-item" onclick="loadContent('/automod')" tabindex="0">
            <i class="fas fa-shield-alt"></i>
            AutoMod
          </div>

          <div class="sidebar-menu-item" onclick="loadContent('/welcome-goodbye')" tabindex="0">
            <i class="fas fa-handshake"></i>
            Welcome/Goodbye
          </div>

          <div class="sidebar-menu-item" onclick="loadContent('/auto-responder')" tabindex="0">
            <i class="fas fa-reply"></i>
            Auto Responder
          </div>

          <div class="sidebar-menu-item" onclick="loadContent('/leveling-system')" tabindex="0">
            <i class="fas fa-chart-line"></i>
            Leveling System
          </div>

          <div class="sidebar-menu-item" onclick="loadContent('/auto-roles')" tabindex="0">
            <i class="fas fa-user-tag"></i>
            Auto Roles
          </div>

          <div class="sidebar-menu-item" onclick="loadContent('/logs')" tabindex="0">
            <i class="fas fa-clipboard-list"></i>
            Logs
          </div>

          <div class="sidebar-menu-item" onclick="loadContent('/colors')" tabindex="0">
            <i class="fas fa-palette"></i>
            Colors
          </div>

          <div class="sidebar-menu-item" onclick="loadContent('/self-assignable-roles')" tabindex="0">
            <i class="fas fa-users-cog"></i>
            Self-Assignable Roles
          </div>

          <div class="sidebar-menu-item" onclick="loadContent('/starboard')" tabindex="0">
            <i class="fas fa-star"></i>
            Starboard
          </div>

          <div class="sidebar-menu-item" onclick="loadContent('/temporary-channels')" tabindex="0">
            <i class="fas fa-clock"></i>
            Temporary Channels
          </div>

          <div class="sidebar-menu-item" onclick="loadContent('/anti-raid')" tabindex="0">
            <i class="fas fa-shield-alt"></i>
            Anti-Raid
          </div>

          <div class="sidebar-menu-item" onclick="loadContent('/social-alerts')" tabindex="0">
            <i class="fas fa-bell"></i>
            Social Alerts
          </div>

          <div class="sidebar-menu-item" onclick="loadContent('/control-panel-logs')" tabindex="0">
            <i class="fas fa-file-alt"></i>
            Control Panel Logs
          </div>

          <div class="sidebar-menu-item" onclick="loadContent('/mod-actions')" tabindex="0">
            <i class="fas fa-user-shield"></i>
            Mod Actions
          </div>

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

        // Adding click event to switch selection on click
        document.querySelectorAll('.sidebar-menu-item').forEach(item => {
          item.addEventListener('click', function() {
            document.querySelectorAll('.sidebar-menu-item').forEach(item => {
              item.classList.remove('selected');
            });
            this.classList.add('selected');
          });
        });

        // Load the overview page by default
        window.addEventListener('load', function() {
          document.querySelector('.sidebar-menu-item').classList.add('selected');
          loadContent('/overview');
        });
      </script>
    </body>
    </html>
  `);
});

module.exports = router;
