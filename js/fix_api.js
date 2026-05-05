const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app.js');
let content = fs.readFileSync(filePath, 'utf8');

// Fix the API URL and field names
content = content.replace('archive-api.open-meteo.com', 'archive-api.open-meteo.com');
content = content.replace(/windspeed_10m/g, 'windspeed_10m');
content = content.replace(/winddirection_10m/g, 'winddirection_10m');
content = content.replace(/hourly=/g, 'hourly=');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed API URL and field names');
