const fs = require("fs");
const path = "./db.json";

// Read the database
function readDB() {
  if (!fs.existsSync(path)) {
    return {};
  }
  const data = fs.readFileSync(path, "utf8");
  return JSON.parse(data);
}

// Write to the database
function writeDB(data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

// Get a value by key
function get(key) {
  const db = readDB();
  return db[key];
}

// Set a value by key
function set(key, value) {
  const db = readDB();
  db[key] = value;
  writeDB(db);
}

// Delete a value by key
function del(key) {
  const db = readDB();
  delete db[key];
  writeDB(db);
}

// List all keys
function list() {
  const db = readDB();
  return Object.keys(db);
}

module.exports = {
  get,
  set,
  del,
  list,
};
