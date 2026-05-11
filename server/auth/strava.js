const express = require('express')
const axios = require('axios')
const { LowSync } = require('lowdb')
const { JSONFileSync } = require('lowdb/node')
const path = require('path')
const router = express.Router()

const dbPath = path.join(__dirname, '..', 'db', 'strava-activities.json')
const db = new LowSync(new JSONFileSync(dbPath), { users: {} })

const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET
const REDIRECT_URI = process.env.STRAVA_REDIRECT_URI || 'http://localhost:3000/api/strava/callback'

router.get('/authorize', (req, res) => {
  const scope = 'read,activity:read_all'
  const authUrl = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}`
  res.redirect(authUrl)
})

router.get('/callback', async (req, res) => {
  const { code } = req.query
  if (!code) return res.status(400).send('Authorization code missing')

  try {
    const tokenRes = await axios.post('https://www.strava.com/oauth/token', {
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code'
    })

    const { access_token, refresh_token, expires_at, athlete } = tokenRes.data
    const userId = athlete.id.toString()

    db.read()
    db.data.users[userId] = {
      id: userId,
      firstname: athlete.firstname,
      lastname: athlete.lastname,
      access_token,
      refresh_token,
      expires_at
    }
    db.write()

    res.redirect(`/strava-activities.html#user_id=${userId}&access_token=${access_token}`)
  } catch (err) {
    console.error('Strava token exchange failed:', err.message)
    res.status(500).send('Authentication failed')
  }
})

router.get('/activities/:userId', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  const { userId } = req.params
  db.read()

  const user = db.data.users[userId]
  if (!user) return res.status(404).json({ error: 'User not found' })

  try {
    const now = Math.floor(Date.now() / 1000)
    if (now >= user.expires_at) {
      const refreshRes = await axios.post('https://www.strava.com/oauth/token', {
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: user.refresh_token
      })

      const { access_token, refresh_token, expires_at } = refreshRes.data
      const updatedUser = db.data.users[userId]
      updatedUser.access_token = access_token
      updatedUser.refresh_token = refresh_token
      updatedUser.expires_at = expires_at
      db.write()

      user.access_token = access_token
      user.refresh_token = refresh_token
      user.expires_at = expires_at
    }

    const after = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60
    const activitiesRes = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
      headers: { Authorization: `Bearer ${user.access_token}` },
      params: { after, per_page: 200 }
    })

    res.json(activitiesRes.data)
  } catch (err) {
    console.error('Failed to fetch activities:', err.message)
    res.status(500).json({ error: 'Failed to fetch activities' })
  }
})

router.get('/user/:userId', (req, res) => {
  const { userId } = req.params
  db.read()
  const user = db.data.users[userId]
  if (!user) return res.status(404).json({ error: 'User not found' })
  const { access_token, refresh_token, ...safeUser } = user
  res.json(safeUser)
})

router.get('/activity/:activityId/gpx', async (req, res) => {
  const { activityId } = req.params
  const userId = req.query.userId

  db.read()
  const user = db.data.users[userId]
  if (!user) return res.status(404).json({ error: 'User not found' })

  try {
    const [streamsRes, activityRes] = await Promise.all([
      axios.get(`https://www.strava.com/api/v3/activities/${activityId}/streams`, {
        headers: { Authorization: `Bearer ${user.access_token}` },
        params: { keys: 'latlng,altitude,time', key_by_type: true }
      }),
      axios.get(`https://www.strava.com/api/v3/activities/${activityId}`, {
        headers: { Authorization: `Bearer ${user.access_token}` }
      })
    ])

    const streams = streamsRes.data
    const activity = activityRes.data
    const latlng = streams.latlng?.data || []
    const altitude = streams.altitude?.data || []
    const timeStream = streams.time?.data || []

    if (latlng.length === 0) {
      return res.status(404).send('No GPS data for this activity')
    }

    const activityStartMs = new Date(activity.start_date).getTime()

    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Strava" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <trkseg>
`

    for (let i = 0; i < latlng.length; i++) {
      const [lat, lon] = latlng[i]
      const ele = altitude[i] || 0
      const secondsFromStart = timeStream[i] !== undefined ? timeStream[i] : 0
      const pointTimestampMs = activityStartMs + (secondsFromStart * 1000)
      const timestamp = new Date(pointTimestampMs).toISOString()
      gpx += `      <trkpt lat="${lat}" lon="${lon}">
        <ele>${ele}</ele>
        <time>${timestamp}</time>
      </trkpt>
`
    }

    gpx += `    </trkseg>
  </trk>
</gpx>`

    res.json({ gpx, startDate: activity.start_date })
  } catch (err) {
    console.error('Failed to fetch GPX:', err.message)
    res.status(500).json({ error: 'Failed to fetch GPX' })
  }
})

module.exports = router
