const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const path = require('path')

dotenv.config()

const stravaRoutes = require('./auth/strava')

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, '..'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
    }
  }
}))

app.use('/api/strava', stravaRoutes)

app.get('/api/config', (req, res) => {
  res.json({
    stravaClientId: process.env.STRAVA_CLIENT_ID,
    stravaRedirectUri: process.env.STRAVA_REDIRECT_URI
  })
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
