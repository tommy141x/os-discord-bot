const db = require("./db");
const path = require("path");
const config = require("./config");
const fs = require("fs");

class GarbageCollector {
  constructor() {
    this.db = db;

    this.collectGarbage();

    this.interval = setInterval(() => {
      this.collectGarbage();
    }, 60000);
  }

  collectGarbage() {
    const embedObjects = this.db.get("embeds");
    const usedFiles = new Set();

    // Collect used file paths from embed objects
    for (const embedID in embedObjects) {
      if (embedObjects.hasOwnProperty(embedID)) {
        const embed = embedObjects[embedID];
        if (embed.image) {
          usedFiles.add(this.getLocalPath(embed.image));
        }
        if (embed.thumbnail) {
          usedFiles.add(this.getLocalPath(embed.thumbnail));
        }
        if (embed.authorIcon) {
          usedFiles.add(this.getLocalPath(embed.authorIcon));
        }
      }
    }

    // Get all files in the media directory
    const mediaDir = path.join(__dirname, "public/media");
    fs.readdir(mediaDir, (err, files) => {
      if (err) {
        console.error(`Error reading media directory: ${err}`);
        return;
      }

      // Delete unused files
      files.forEach((file) => {
        const filePath = path.join(mediaDir, file);
        if (!usedFiles.has(filePath)) {
          fs.unlink(filePath, (err) => {
            if (err) {
              console.error(`Error deleting file ${filePath}: ${err}`);
            } else {
              console.log(`Deleted unused file: ${filePath}`);
            }
          });
        }
      });
    });
  }

  getLocalPath(url) {
    const publicUrl = config.publicURL;
    return path.join(__dirname, "public", url.replace(publicUrl, ""));
  }
}

module.exports = GarbageCollector;
